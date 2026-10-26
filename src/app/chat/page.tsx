'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock,
  Copy,
  Database,
  Download,
  FileText,
  FileUp,
  Globe,
  History,
  Mail,
  MessageSquare,
  Paperclip,
  PieChart,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  TrendingUp,
  UserCheck,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import AppLayout from '@/components/layout/app-layout';
import { PageLoading } from '@/components/ui/page-loading';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { agents } from '@/lib/mock-data';
import { cn, generateId, sleep } from '@/lib/utils';
import type { Agent, AgentCategory, PolicyCheck } from '@/lib/types';

const categoryIcons: Record<AgentCategory, LucideIcon> = {
  lease: FileText,
  valuation: TrendingUp,
  market: BarChart3,
  portfolio: PieChart,
  maintenance: Wrench,
  tenant: UserCheck,
  document: FileText,
  esg: Globe,
  insurance: ShieldCheck,
  tax: FileText,
  email: Mail,
  lead: MessageSquare,
  data: Database,
};

const categoryAccent: Record<AgentCategory, string> = {
  lease: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  valuation: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  market: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  portfolio: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  maintenance: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  tenant: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  document: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
  esg: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  insurance: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  tax: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  email: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  lead: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  data: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20',
};

const quickActions = [
  { label: 'Abstract this lease', icon: FileText },
  { label: 'Run valuation', icon: CircleDollarSign },
  { label: 'Analyze market', icon: BarChart3 },
  { label: 'Screen tenant', icon: UserCheck },
];

const agentCapabilities: Record<string, string[]> = {
  'agent-001': [
    'Extract lease terms, clauses, and obligations from documents',
    'Identify non-standard clauses and flag for human review',
    'Cross-reference against 1,200+ clause patterns',
    'Generate structured lease abstracts with confidence scores',
  ],
  'agent-002': [
    'Perform automated valuations using income, comparable, and cost approaches',
    'Generate DCF models with 10-year projections',
    'Analyze market trends and cap rates',
    'Provide NPV, IRR, and cash flow analysis',
  ],
  'agent-003': [
    'Monitor market conditions across 12 markets',
    'Track rent trends, vacancy rates, and absorption',
    'Generate 12-month market forecasts',
    'Correlate economic indicators with real estate performance',
  ],
  'agent-004': [
    'Analyze portfolio performance and risk metrics',
    'Recommend acquisitions and dispositions',
    'Optimize portfolio allocation with mean-variance models',
    'Identify concentration and interest rate risks',
  ],
  'agent-005': [
    'Predict equipment failures using IoT sensor data',
    'Forecast maintenance needs with LSTM neural networks',
    'Generate preventive maintenance schedules',
    'Estimate repair costs and urgency levels',
  ],
  'agent-006': [
    'Evaluate tenant creditworthiness and business stability',
    'Analyze financial statements and credit history',
    'Assess lease compliance risk',
    'Provide risk scores and approval recommendations',
  ],
  'agent-007': [
    'Classify and extract data from leases, deeds, and financial statements',
    'Process documents with NLP and layout analysis',
    'Extract 47+ fields with confidence scoring',
    'Validate output against schema v2',
  ],
  'agent-011': [
    'Send automated outreach emails to landlords and realty professionals',
    'Wait for replies and extract willingness and key details',
    'Continue workflows based on extracted information',
    'Track email threads and response rates',
  ],
  'agent-012': [
    'Respond to every inquiry instantly — day or night',
    'Share pricing, availability, and floor plan details',
    'Schedule tours directly on the team calendar',
    'Run follow-up sequences to keep prospects engaged',
    'Score leads and surface the ones that need attention',
  ],
  'agent-atlas': [
    'Synthesize market snapshots, lease documents, emails, and leads',
    'Keep the data fabric fresh with live LLM inference',
    'Feed structured context to every other agent',
    'Track artifact lineage across the portfolio',
  ],
};

const suggestedFollowUps: Record<string, string[]> = {
  'agent-001': [
    'What are the renewal options?',
    'Flag any non-standard clauses',
    'Compare with market rates',
  ],
  'agent-002': [
    'What is the cap rate?',
    'Show comparable sales',
    'Run a sensitivity analysis',
  ],
  'agent-003': [
    'Forecast for next quarter',
    'Compare with other markets',
    'What are the risk factors?',
  ],
  'agent-004': [
    'What should I dispose?',
    'Show risk assessment',
    'Recommend acquisitions',
  ],
  'agent-005': [
    'Which systems need attention?',
    'Show cost estimates',
    'Schedule maintenance',
  ],
  'agent-006': [
    'What is the risk score?',
    'Show payment history',
    'Approve or reject?',
  ],
  'agent-007': [
    'Extract all fields',
    'Classify this document',
    'Validate against schema',
  ],
  'agent-011': [
    'Send outreach to landlords',
    'Check email responses',
    'Extract deal details',
  ],
  'agent-012': [
    'Respond to a new inquiry',
    'Share pricing and availability',
    'Schedule a tour',
    'Score this lead',
  ],
  'agent-atlas': [
    'What artifacts were synthesized today?',
    'Show data fabric health',
    'Which agents consumed fresh context?',
  ],
};

type MessageAction = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  confidence?: number;
  executionTime?: number;
  policyChecks?: PolicyCheck[];
  trace?: string[];
  streaming?: boolean;
  timestamp: number;
  actions?: MessageAction[];
};

type Conversation = {
  id: string;
  agentId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = 'realtomatic-conversations';

const welcomeMessages: Record<string, string> = {
  'agent-001': `**Lease Abstractor** ready. I extract key terms, clauses, and obligations from lease documents using NLP and document AI.

Try one of the quick actions, or upload a lease document to get started.`,
  'agent-002': `**Valuation Engine** online. I perform automated valuations using comparable sales, income approach, and market trends.

Ask me to value a property or run a full portfolio valuation.`,
  'agent-003': `**Market Intelligence** standing by. I monitor market conditions, rent trends, and economic indicators across 12 markets.

Ask me to analyze a market or generate a forecast.`,
  'agent-004': `**Portfolio Optimizer** ready. I analyze portfolio performance and recommend acquisitions, dispositions, and optimizations.

Ask me to review the portfolio or identify opportunities.`,
  'agent-005': `**Maintenance Predictor** online. I predict equipment failures using IoT sensor data and historical patterns.

Ask me to check a property or forecast maintenance needs.`,
  'agent-006': `**Tenant Screener** ready. I evaluate creditworthiness, business stability, and lease compliance risk.

Ask me to screen a tenant or assess risk.`,
  'agent-007': `**Document Processor** online. I classify and extract data from leases, deeds, and financial statements.

Upload a document and I'll process it for you.`,
  'agent-011': `**Email Outreach Agent** ready. I automate email communication with landlords and realty professionals.

I can send outreach emails, wait for replies, extract willingness and details, and continue workflows based on responses.`,
  'agent-012': `**Lead Response Agent** ready. I respond to every inquiry instantly, keep prospects engaged, and surface what needs attention.

Ask me to respond to an inquiry, share pricing, schedule a tour, run a follow-up sequence, or score a lead.`,
  'agent-atlas': `**Atlas — Data Synthesis** online. I keep the data fabric alive: synthesizing market snapshots, lease documents, tenant emails, and leads with live LLM inference to feed every other agent.

Ask me what was synthesized today or check data fabric health.`,
};

function makeWelcomeMessage(agent: Agent): ChatMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    content: welcomeMessages[agent.id] ?? welcomeMessages['agent-001'],
    confidence: 1,
    executionTime: 0,
    timestamp: Date.now(),
  };
}

function buildMockResponse(
  agent: Agent,
  userContent: string,
  conversationHistory: ChatMessage[]
): { content: string; confidence: number; trace: string[] } {
  const lower = userContent.toLowerCase();
  const recentUserMessages = conversationHistory
    .filter((m) => m.role === 'user')
    .slice(-3)
    .map((m) => m.content.toLowerCase());

  const hasRecentContext = (keywords: string[]) =>
    recentUserMessages.some((msg) => keywords.some((kw) => msg.includes(kw)));

  if (agent.id === 'agent-001') {
    if (lower.includes('abstract') || lower.includes('lease') || lower.includes('extract')) {
      return {
        confidence: 0.94,
        trace: [
          'VM booted in 1.2s (microvm, 2 vCPU, 2GB RAM)',
          'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
          'Document parsed: 47 pages, OCR confidence 99.1%',
          'NLP extraction: 5 clauses identified',
          'Cross-referenced against 1,240 clause patterns',
          'Confidence scoring complete',
        ],
        content: `## Lease Abstract — Acme Corp

**Property:** One Congress Plaza, 1 Congress Ave, Austin, TX 78701
**Tenant:** Acme Corp (Technology)
**Term:** Jan 15, 2023 → Jan 14, 2028 (5 years)
**Monthly Rent:** $185,000 (NNN)

### Extracted Clauses

| Clause | Type | Confidence |
|--------|------|------------|
| Base Rent Escalation | Rent | 98% |
| Lease Term | Term | 99% |
| Renewal Option (2x 5yr) | Renewal | 95% |
| CAM Cap (5% annual) | CAM | 92% |
| Co-Tenancy Provision | Co-Tenancy | 78% ⚠️ |

### Key Findings

- **Co-tenancy clause** is non-standard — tenant may terminate if anchor vacates for 180+ days
- **Renewal options:** Two 5-year options at 95% of fair market rent
- **CAM cap:** 5% annual increase over base year 2023

> ⚠️ 1 clause flagged for human review (co-tenancy provision, confidence 78%)`,
      };
    }
    if (hasRecentContext(['abstract', 'lease', 'extract']) && lower.includes('renewal')) {
      return {
        confidence: 0.95,
        trace: [
          'VM booted in 1.1s',
          'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
          'Referencing previous lease abstract for Acme Corp',
          'Renewal clause analysis complete',
        ],
        content: `## Renewal Options — Acme Corp Lease

Based on the previous abstract, here are the renewal details:

| Option | Term | Rent | Notice Required |
|--------|------|------|-----------------|
| Renewal 1 | 5 years | 95% of FMR | 180 days before expiry |
| Renewal 2 | 5 years | 95% of FMR | 180 days before expiry |

### Key Points

- **Fair Market Rent (FMR)** is determined by appraisal if parties cannot agree
- **Personal guarantee** is waived during renewal periods
- **Tenant improvement allowance:** $25/sq ft for each renewal term
- **Right of first offer:** Tenant has ROFO on adjacent 15,000 sq ft space

> **Recommendation:** Begin renewal discussions 12 months before expiry to maximize negotiating leverage.`,
      };
    }
    return {
      confidence: 0.91,
      trace: [
        'VM booted in 1.1s',
        'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
        'Awaiting document upload for extraction',
      ],
      content: `I can extract lease terms from any document. Upload a lease PDF or ask me to abstract a specific lease.

**Supported extractions:**
- Rent terms and escalations
- Lease duration and renewal options
- CAM, insurance, and maintenance obligations
- Termination and assignment clauses
- Co-tenancy and exclusive use provisions`,
    };
  }

  if (agent.id === 'agent-002') {
    if (lower.includes('valuation') || lower.includes('value') || lower.includes('run')) {
      return {
        confidence: 0.93,
        trace: [
          'VM booted in 1.4s (microvm, 4 vCPU, 4GB RAM)',
          'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
          'Comparable sales query: 6 properties found',
          'Income approach: DCF model with 10-year projection',
          'Market trend analysis: Austin office cap rates',
          'Valuation synthesis complete',
        ],
        content: `## Valuation Report — The Domain Tower

**Property:** 11011 Domain Dr, Austin, TX 78758
**Type:** Office | **Size:** 320,000 sq ft | **Year Built:** 2021

### Valuation Summary

| Approach | Value | Weight |
|----------|-------|--------|
| Income Approach (DCF) | $172.4M | 60% |
| Comparable Sales | $181.2M | 30% |
| Cost Approach | $168.9M | 10% |
| **Weighted Value** | **$178.0M** | — |

### Key Metrics

- **Cap Rate:** 5.8% (market avg: 6.1%)
- **NOI:** $10.3M
- **NPV (10yr):** $24.7M
- **IRR:** 11.2%
- **Price/sq ft:** $556

### Comparable Sales

| Property | Price | $/sq ft | Cap Rate |
|----------|-------|---------|----------|
| 11001 Domain Dr | $168M | $525 | 5.9% |
| 11020 Domain Dr | $185M | $578 | 5.7% |
| 11035 Domain Dr | $179M | $560 | 5.8% |

> **Recommendation:** Hold — property is performing above market average with 97% occupancy and strong tenant credit.`,
      };
    }
    return {
      confidence: 0.89,
      trace: [
        'VM booted in 1.3s',
        'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
        'Awaiting valuation request',
      ],
      content: `I can perform automated valuations using multiple approaches:

**Valuation Methods:**
- Income approach (DCF, direct cap)
- Comparable sales analysis
- Cost approach

**Outputs:**
- Property valuation with confidence score
- Comparable sales report
- NPV, IRR, and cash flow projections
- Market trend analysis

Ask me to value a specific property or run a portfolio-wide valuation.`,
    };
  }

  if (agent.id === 'agent-003') {
    if (lower.includes('market') || lower.includes('analyze')) {
      return {
        confidence: 0.92,
        trace: [
          'VM booted in 1.8s (microvm, 2 vCPU, 3GB RAM)',
          'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
          'Data sources: Census, BLS, Realtor.com, CoStar, local MLS',
          'Market trend analysis: 12-month rolling window',
          'Forecast model: ARIMA with seasonal adjustment',
          'Report generation complete',
        ],
        content: `## Market Analysis — Austin Office

**Report Date:** November 2026 | **Market:** Austin, TX

### Key Metrics

| Metric | Value | YoY Change |
|--------|-------|------------|
| Median Rent | $38.50/sq ft | +4.2% |
| Vacancy Rate | 12.8% | -1.3% |
| Net Absorption | 125,000 sq ft | +18% |
| Cap Rate | 5.8% | -0.2% |
| Job Growth | 3.1% | +0.4% |

### Market Trends

- **Vacancy declining** for 3 consecutive quarters
- **Rental rates stabilizing** after 2023 correction
- **Class A demand strong** — 96% occupancy in premium buildings
- **Cap rates compressing** 25bps in core submarkets
- **Population growth** at 2.4% annually drives demand

### 12-Month Forecast

- Rent growth: **3.5–4.5%**
- Vacancy: **11.5–12.5%**
- Cap rate: **5.6–5.9%**
- Absorption: **130,000–150,000 sq ft**

### Risk Factors

- Remote work continues to impact office demand
- Elevated construction costs limit new supply
- Interest rate uncertainty may slow investment

> **Outlook:** Positive — Austin remains one of the strongest office markets in the Sun Belt.`,
      };
    }
    return {
      confidence: 0.90,
      trace: [
        'VM booted in 1.6s',
        'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
        'Awaiting market analysis request',
      ],
      content: `I monitor and analyze real estate market conditions across 12 markets.

**Capabilities:**
- Market trend analysis and forecasting
- Rent and vacancy rate tracking
- Cap rate monitoring
- Economic indicator correlation
- Submarket comparisons

Ask me to analyze a specific market or generate a comprehensive report.`,
    };
  }

  if (agent.id === 'agent-004') {
    return {
      confidence: 0.88,
      trace: [
        'VM booted in 2.1s (microvm, 4 vCPU, 8GB RAM)',
        'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
        'Portfolio data loaded: 12 properties, $1.685B AUM',
        'Performance analysis: YoY returns, risk metrics',
        'Optimization model: mean-variance with constraints',
        'Recommendations generated',
      ],
      content: `## Portfolio Optimization Report

**Portfolio:** 12 properties | **AUM:** $1.685B | **Avg Occupancy:** 93.2%

### Performance Summary

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| YoY Growth | 8.4% | 7.0% | ✅ |
| Avg Cap Rate | 6.1% | 6.0% | ✅ |
| Occupancy | 93.2% | 92.0% | ✅ |
| Expiring (90d) | 3 leases | — | ⚠️ |

### Recommendations

1. **Dispose** — Galleria Office Tower II (Houston)
   - Market declining, 19.8% vacancy, cap rate 6.8%
   - Estimated proceeds: $142M
   - Reinvest in Austin or Nashville

2. **Acquire** — Class A office in Nashville
   - Market growing at 11.2% YoY
   - Target cap rate: 5.9%
   - Estimated value: $180–200M

3. **Renegotiate** — 3 expiring leases (90 days)
   - Combined monthly rent: $428,000
   - Recommend 5-year renewals with 3% escalations

### Risk Assessment

- **Concentration risk:** 35% in Texas markets
- **Interest rate sensitivity:** Moderate
- **Tenant credit quality:** Strong (avg score 742)`,
    };
  }

  if (agent.id === 'agent-005') {
    return {
      confidence: 0.91,
      trace: [
        'VM booted in 0.9s (microvm, 1 vCPU, 1GB RAM)',
        'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
        'IoT sensor data: 2.4M readings from 12 properties',
        'Failure prediction model: LSTM neural network',
        'Maintenance history cross-reference',
        'Predictions generated',
      ],
      content: `## Maintenance Forecast — Q1 2025

**Analysis Period:** Jan–Mar 2025 | **Properties:** 12

### Predicted Issues

| Property | System | Probability | Est. Cost | Urgency |
|----------|--------|-------------|-----------|---------|
| RiNo Lofts | HVAC | 87% | $340,000 | 🔴 Critical |
| One Congress | Elevator | 34% | $85,000 | 🟡 Medium |
| Domain Tower | Roof | 22% | $120,000 | 🟡 Medium |

### Scheduled Maintenance

- **HVAC replacements:** 2 units (RiNo Lofts, Desert Ridge)
- **Elevator modernization:** 1 unit (One Congress Plaza)
- **Roof inspections:** 4 properties
- **Fire system testing:** All properties

### Cost Summary

- **Predicted repair costs:** $545,000
- **Preventive maintenance:** $320,000
- **Total Q1 budget:** $865,000
- **Savings vs reactive:** ~$210,000 (24%)

> ⚠️ **Critical:** HVAC at RiNo Art District Lofts has 87% failure probability within 30 days. Immediate action recommended.`,
    };
  }

  if (agent.id === 'agent-006') {
    if (lower.includes('screen') || lower.includes('tenant')) {
      return {
        confidence: 0.89,
        trace: [
          'VM booted in 1.0s (microvm, 1 vCPU, 1GB RAM)',
          'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
          'Credit check: Equifax, D&B',
          'Financial analysis: 3 years of statements',
          'Risk scoring model: gradient boosting',
          'Assessment complete',
        ],
        content: `## Tenant Risk Assessment — Acme Corp

**Tenant:** Acme Corp | **Industry:** Technology
**Lease:** One Congress Plaza | **Term:** 5 years

### Credit Profile

| Metric | Value | Rating |
|--------|-------|--------|
| Credit Score | 780 | Excellent |
| Revenue Growth | 12% YoY | Strong |
| Debt/Equity | 0.42 | Low |
| Current Ratio | 2.8 | Strong |
| Years in Business | 14 | Established |

### Risk Assessment

- **Overall Risk Score:** 22/100 (Low Risk)
- **Probability of Default:** 1.2%
- **Lease Compliance History:** 100% (no violations)
- **Payment History:** 48/48 on-time payments

### Recommendation

✅ **Approve** — Standard lease terms recommended

- No personal guarantee required
- Security deposit: 2 months ($370,000)
- Rent escalation: 3% annual

> **Note:** Tenant has strong financials and excellent credit history. Low risk of default or lease violation.`,
      };
    }
    return {
      confidence: 0.87,
      trace: [
        'VM booted in 1.0s',
        'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
        'Awaiting tenant screening request',
      ],
      content: `I evaluate tenant creditworthiness, business stability, and lease compliance risk.

**Screening includes:**
- Credit score and history
- Financial statement analysis
- Business stability assessment
- Lease compliance history
- Industry risk factors

Ask me to screen a specific tenant or assess risk for a lease renewal.`,
    };
  }

  if (agent.id === 'agent-011') {
    if (lower.includes('send') || lower.includes('outreach') || lower.includes('email') || lower.includes('landlord')) {
      return {
        confidence: 0.96,
        trace: [
          'VM booted in 1.3s (microvm, 2 vCPU, 2GB RAM)',
          'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
          'Email outreach pipeline initialized',
          'Target list: 12 landlords and realty professionals',
          'Email templates loaded and personalized',
          'Outreach emails queued for sending',
        ],
        content: `## Email Outreach Campaign — Landlord Engagement

**Campaign:** Q4 Lease Renewal Outreach
**Targets:** 12 landlords and realty professionals
**Status:** Emails sent, awaiting replies

### Outreach Summary

| Metric | Value |
|--------|-------|
| Emails Sent | 156 |
| Responses Received | 89 |
| Response Rate | 57% |
| Deals Progressed | 23 |
| Active Threads | 12 |

### Recent Threads

**1. Lease Renewal — One Congress Plaza**
- **Status:** Replied
- **Extracted:** Interested in 3-year term with 2.5% escalation
- **Next Step:** Schedule call to discuss TI allowance

**2. Property Management — The Domain Tower**
- **Status:** Awaiting reply
- **Sent:** Nov 20, 2026
- **Follow-up:** Auto-reminder in 3 days

**3. Partnership — Galleria Financial Center**
- **Status:** Replied
- **Extracted:** Requested case studies and pricing
- **Next Step:** Send proposal package

### Extracted Insights

- **Willingness to engage:** 73% of landlords responded positively
- **Preferred terms:** 3-year terms with 2.5-3% escalations
- **Common requests:** TI allowance, CAM caps, renewal options
- **Hot leads:** 5 landlords ready for immediate discussion

> **Action:** 5 hot leads identified. Recommend prioritizing follow-up calls this week.`,
      };
    }
    if (lower.includes('response') || lower.includes('reply') || lower.includes('extract') || lower.includes('detail')) {
      return {
        confidence: 0.94,
        trace: [
          'VM booted in 1.2s',
          'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
          'Email thread analysis: 12 active threads',
          'NLP extraction: willingness and key details',
          'Workflow continuation triggered',
        ],
        content: `## Email Response Analysis — Extracted Details

**Analysis Date:** Nov 21, 2026
**Threads Analyzed:** 12 active email threads

### Response Overview

| Thread | Status | Willingness | Key Details |
|--------|--------|-------------|-------------|
| One Congress Plaza | Replied | High | 3yr term, 2.5% escalation, TI discussion |
| The Domain Tower | Awaiting | — | Sent Nov 20, reminder in 3 days |
| Galleria Financial | Replied | Medium | Requested case studies and pricing |
| Biscayne Bayfront | Replied | High | Interested in partnership, 5yr term |
| RiNo Lofts | Replied | Low | Not ready, follow up in Q1 |

### Extracted Willingness

- **High willingness (ready to deal):** 5 landlords
- **Medium willingness (need info):** 4 landlords
- **Low willingness (not ready):** 3 landlords

### Key Details Extracted

**One Congress Plaza (James Morrison):**
- Interested in 3-year renewal
- Prefers 2.5% annual escalation
- Wants to discuss TI allowance
- Available for call next week

**Biscayne Bayfront (Oceanview Hospitality):**
- Interested in 5-year partnership
- Wants to explore property management
- Requested proposal by Dec 1

**Galleria Financial Center:**
- Open to partnership
- Needs case studies and pricing
- Implementation timeline: Q1 2025

### Workflow Actions

- [x] Follow-up emails sent to 5 hot leads
- [x] Meeting requests sent to 3 landlords
- [ ] Proposal package to Galleria Financial (pending)
- [ ] Q1 follow-up scheduled for RiNo Lofts

> **Result:** 8 deals progressed from email outreach this month. 5 hot leads require immediate attention.`,
      };
    }
    return {
      confidence: 0.92,
      trace: [
        'VM booted in 1.2s',
        'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
        'Awaiting outreach or response analysis request',
      ],
      content: `I automate email communication with landlords and realty professionals.

**Capabilities:**
- Send personalized outreach emails to landlords
- Wait for replies and extract willingness and details
- Continue workflows based on extracted information
- Track email threads and response rates

**Ask me to:**
- Send outreach to landlords
- Check email responses
- Extract deal details from threads`,
    };
  }

  if (agent.id === 'agent-012') {
    if (lower.includes('price') || lower.includes('pricing') || lower.includes('availability') || lower.includes('available') || lower.includes('floor plan')) {
      return {
        confidence: 0.95,
        trace: [
          'VM booted in 1.2s (microvm, 2 vCPU, 2GB RAM)',
          'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
          'Listing inventory synced: 14 active units',
          'Pricing engine: real-time rent and fee data',
          'Availability check complete',
        ],
        content: `## Pricing & Availability

**Updated:** Just now · **Source:** Live listing inventory

### Available Units

| Floor Plan | Sq Ft | Rent | Available | Incentives |
|------------|-------|------|-----------|------------|
| Studio | 520 | $1,750/mo | Now | 1 month free |
| 1 Bedroom | 740 | $2,400/mo | Now | 1 month free |
| 2 Bedroom | 1,080 | $3,500/mo | Dec 1 | 2 weeks free |
| 3 Bedroom | 1,420 | $5,200/mo | Jan 15 | — |

### Fees & Deposits

- **Application fee:** $50 (waived this week)
- **Security deposit:** $500 (refundable, due at lease signing)
- **Pet deposit:** $300 + $30/mo pet rent
- **Parking:** $75/mo surface · $125/mo covered

### Floor Plans

All floor plans include in-unit washer/dryer, quartz countertops, and smart home packages. PDF floor plans are ready to send on request.

> **Note:** Pricing is dynamic and updates daily. The 2BR at $3,500/mo is our most inquired unit — 6 leads requested it this week.`,
      };
    }
    if (lower.includes('tour') || lower.includes('visit') || lower.includes('schedule') || lower.includes('book')) {
      return {
        confidence: 0.94,
        trace: [
          'VM booted in 1.1s',
          'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
          'Calendar sync: Google Calendar (2 agents)',
          'Tour slots generated: next 5 business days',
          'Booking confirmation drafted',
        ],
        content: `## Tour Scheduling

**Calendar synced** with Sarah Chen and Mike Wilson. Here are the open slots:

### Available Tour Slots

| Date | Time | Agent | Duration |
|------|------|-------|----------|
| Thu, Oct 2 | 10:00 AM | Sarah Chen | 45 min |
| Thu, Oct 2 | 1:30 PM | Mike Wilson | 45 min |
| Fri, Oct 3 | 11:00 AM | Sarah Chen | 45 min |
| Fri, Oct 3 | 3:00 PM | Mike Wilson | 45 min |
| Mon, Oct 6 | 9:30 AM | Sarah Chen | 45 min |

### What Happens Next

1. **Pick a slot** — I will book it instantly and send a calendar invite
2. **Reminder** — Automated reminder 2 hours before the tour
3. **Follow-up** — Post-tour summary with pricing and next steps within 1 hour

### Recently Booked

- **Sarah Mitchell** — The Domain Tower 2BR — Thu, Oct 2 at 10:00 AM ✅
- **Michael Chen** — Galleria 3BR — Fri, Oct 3 at 11:00 AM ✅

> **Tip:** Tours booked before 2 PM are 38% more likely to convert. I recommend the Thursday morning slot.`,
      };
    }
    if (lower.includes('follow') || lower.includes('sequence') || lower.includes('nurture') || lower.includes('reminder')) {
      return {
        confidence: 0.93,
        trace: [
          'VM booted in 1.2s',
          'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
          'Follow-up playbook loaded: 5-step nurture sequence',
          'Email + SMS channels connected',
          'Sequence preview generated',
        ],
        content: `## Follow-Up Sequence

**Playbook:** 5-Step Nurture Sequence · **Channels:** Email + SMS

### Sequence Overview

| Step | Timing | Channel | Message |
|------|--------|---------|---------|
| 1 | Instant | Email | Thank you + pricing & floor plans |
| 2 | Day 1 | SMS | Tour invitation with booking link |
| 3 | Day 3 | Email | Neighborhood guide + resident reviews |
| 4 | Day 5 | SMS | Incentive reminder (1 month free ends soon) |
| 5 | Day 7 | Email | Personal outreach from assigned agent |

### Engagement Rules

- **Stop on reply** — the sequence pauses the moment the lead responds
- **Escalate hot leads** — any lead who clicks 2+ links goes to the agent queue immediately
- **Re-engage cold leads** — after 14 days of silence, a fresh angle is sent automatically

### Current Performance

- **Open rate:** 68% (industry avg: 21%)
- **Reply rate:** 41%
- **Tours booked from sequence:** 23 this month

> **Result:** Leads in the nurture sequence convert at 2.4x the rate of one-off inquiries.`,
      };
    }
    if (lower.includes('score') || lower.includes('qualif') || lower.includes('priority') || lower.includes('hot')) {
      return {
        confidence: 0.96,
        trace: [
          'VM booted in 1.1s',
          'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
          'Lead scoring model: 12 signals weighted',
          'Cross-referenced with 6 months of conversion data',
          'Scores generated for 10 active leads',
        ],
        content: `## Lead Scoring

**Model:** 12-signal weighted scoring · **Range:** 0–100

### Top Leads Right Now

| Lead | Source | Score | Signal |
|------|--------|-------|--------|
| Michael Chen | Referral | 95 | Referred · ready to sign |
| Sarah Mitchell | Zillow | 92 | Booked tour · Dec 1 move-in |
| Lisa Anderson | Referral | 89 | Referred · this month |
| James Rodriguez | Realtor.com | 87 | Tour requested · weekend |
| David Kim | Website | 81 | Firm budget · remote work |

### Scoring Signals

- **Source quality** (20%) — referrals and Zillow score highest
- **Engagement depth** (25%) — tours booked, emails opened, links clicked
- **Budget fit** (20%) — matches an available floor plan
- **Timeline** (20%) — move-in within 60 days
- **Completeness** (15%) — contact info, unit preference, budget provided

### Recommended Actions

1. **Call Michael Chen today** — score 95, referred, ready to sign
2. **Confirm Sarah Mitchell's tour** — score 92, already booked
3. **Nurture James Rodriguez** — score 87, send weekend tour options

> **Alert:** 3 new leads are unassigned. Jessica Davis (64), Robert Martinez (58), and Kevin Brown (45) need agent routing.`,
      };
    }
    if (lower.includes('respond') || lower.includes('inquiry') || lower.includes('reply') || lower.includes('message') || lower.includes('answer')) {
      return {
        confidence: 0.97,
        trace: [
          'VM booted in 1.0s',
          'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
          'Incoming inquiry parsed: Zillow lead form',
          'Response template matched: availability question',
          'Personalized reply composed and sent in 1.8s',
        ],
        content: `## Instant Response Sent

**Inquiry:** "Is the 2BR at The Domain Tower still available for November?"
**Received:** 2:42 PM · **Responded:** 2:42 PM · **Response time:** 1.8 seconds

### What the Prospect Received

> Hi Sarah! Yes — the 2BR at The Domain Tower is available for November. We have 2 units left at $3,500/mo with 1 month free on a 12-month lease. Would you like to see it? I can book a tour for this week — here are my open slots: Thursday 10 AM, Thursday 1:30 PM, or Friday 11 AM.

### Why This Works

- **Instant** — answered in under 2 seconds, day or night
- **Accurate** — pulled live availability and pricing from the listing inventory
- **Personalized** — referenced the exact unit and move-in month
- **Action-oriented** — every reply ends with a clear next step (book a tour)

### Response Performance

- **Avg response time:** 2 minutes (vs 4.2 hours industry avg)
- **Response rate:** 94% of all inquiries answered
- **Tours from instant replies:** 31 this month

> **Result:** Prospects who get an instant reply are 3.1x more likely to book a tour.`,
      };
    }
    return {
      confidence: 0.92,
      trace: [
        'VM booted in 1.1s',
        'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
        'Awaiting lead response request',
      ],
      content: `I respond to every inquiry instantly, keep prospects engaged, and surface what needs attention.

**I can:**
- Respond to a new inquiry in under 2 seconds
- Share pricing, availability, and floor plan details
- Schedule tours directly on the team calendar
- Run follow-up sequences to nurture cold leads
- Score leads and flag the ones that need attention

**Ask me to:**
- Respond to a new inquiry
- Share pricing and availability
- Schedule a tour
- Run a follow-up sequence
- Score this lead`,
    };
  }

  if (agent.id === 'agent-atlas') {
    return {
      confidence: 0.97,
      trace: [
        'VM booted in 1.4s (microvm, 4 vCPU, 8GB RAM)',
        'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
        'Data fabric heartbeat: 4 artifact kinds fresh',
        'Live LLM inference: synthesis batch complete',
        'Artifact lineage recorded',
      ],
      content: `## Data Fabric — Synthesis Report

**Agent:** Atlas — Data Synthesis | **Heartbeat:** Always-on

### Artifact Freshness

| Artifact Kind | Artifacts | Fresh (24h) | Consumers |
|---------------|-----------|-------------|-----------|
| Market Snapshot | 12 | 12 | Valuation, Portfolio |
| Lease Document | 34 | 9 | Lease Abstractor, Tenant Screener |
| Tenant Email | 89 | 23 | Email Outreach |
| Lead | 47 | 18 | Lead Response |

### Recent Synthesis

- **Market snapshots** refreshed for all 12 tracked markets
- **9 lease documents** synthesized from overnight uploads
- **23 tenant email threads** summarized with willingness extracted
- **18 new leads** scored and routed to agents

> **Status:** Data fabric healthy. All downstream agents are consuming fresh context.`,
    };
  }

  return {
    confidence: 0.95,
    trace: [
      'VM booted in 1.1s (microvm, 2 vCPU, 2GB RAM)',
      'Policy checks passed: cosign ✓ sbom ✓ seccomp ✓',
      'Document classification: NLP + layout analysis',
      'Data extraction: 47 fields identified',
      'Confidence scoring complete',
    ],
    content: `## Document Processing Complete

**Document:** lease-001.pdf | **Pages:** 47
**Classification:** Commercial Office Lease (confidence: 99.1%)

### Extracted Data

| Field | Value | Confidence |
|-------|-------|------------|
| Tenant Name | Acme Corp | 99% |
| Property Address | 1 Congress Ave, Austin, TX | 98% |
| Lease Term | 5 years | 99% |
| Monthly Rent | $185,000 | 99% |
| Start Date | Jan 15, 2023 | 98% |
| End Date | Jan 14, 2028 | 98% |
| Lease Type | NNN | 97% |
| Security Deposit | $370,000 | 96% |

### Document Summary

Commercial office lease between One Congress Plaza (Landlord) and Acme Corp (Tenant) for 45,000 sq ft of office space. 5-year initial term with two 5-year renewal options. NNN lease with 3% annual rent escalations and 5% CAM cap.

> **Status:** All fields extracted with high confidence. No manual review required.`,
  };
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-slate-300">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <h2 key={i} className="pt-2 text-base font-semibold text-white">
              {line.slice(3)}
            </h2>
          );
        }
        if (line.startsWith('### ')) {
          return (
            <h3 key={i} className="pt-1.5 text-sm font-semibold text-slate-200">
              {line.slice(4)}
            </h3>
          );
        }
        if (line.startsWith('| ')) {
          const cells = line.split('|').filter((c) => c.trim());
          if (cells.every((c) => /^[-:]+$/.test(c.trim()))) return null;
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  <tr className="border-b border-slate-700/50">
                    {cells.map((cell, j) => (
                      <td key={j} className="px-2 py-1.5 text-slate-300">
                        {cell.trim()}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          );
        }
        if (line.startsWith('- ')) {
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-500" />
              <span>{line.slice(2)}</span>
            </div>
          );
        }
        if (line.startsWith('> ')) {
          return (
            <div key={i} className="border-l-2 border-amber-500/50 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-200/90">
              {line.slice(2)}
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1" />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

function TypingIndicator({ agentName }: { agentName: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-2">
      <span className="text-xs text-slate-400">{agentName} is thinking</span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
}

function PolicyCheckIcon({ check }: { check: PolicyCheck }) {
  const color =
    check.status === 'passed'
      ? 'text-emerald-400'
      : check.status === 'warning'
        ? 'text-amber-400'
        : 'text-red-400';
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium', color)} title={check.details}>
      {check.status === 'passed' ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {check.name}
    </span>
  );
}

function FilePreviewCard({
  name,
  size,
  type,
  onRemove,
}: {
  name: string;
  size: number;
  type: string;
  onRemove: () => void;
}) {
  const isDocument =
    type.includes('pdf') ||
    type.includes('word') ||
    type.includes('doc') ||
    type.includes('text');

  const getFileColor = (fileType: string) => {
    if (fileType.includes('pdf')) return 'text-red-400 bg-red-500/10 border-red-500/20';
    if (fileType.includes('word') || fileType.includes('doc')) return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    if (fileType.includes('text')) return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const colorClass = getFileColor(type);

  return (
    <div className="mb-2 flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5">
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border', colorClass)}>
        {isDocument ? <FileText className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-200">{name}</p>
        <p className="text-[10px] text-slate-500">
          {formatFileSize(size)} · {type || 'Unknown type'}
        </p>
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-300"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function MessageTimestamp({ timestamp }: { timestamp: number }) {
  return (
    <span className="text-[10px] text-slate-600">
      {new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-300"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function RegenerateButton({ onRegenerate, disabled }: { onRegenerate: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onRegenerate}
      disabled={disabled}
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-300 disabled:opacity-40"
      title="Regenerate response"
    >
      <RefreshCw className="h-3 w-3" />
      Regenerate
    </button>
  );
}

function ActionButtons({ actions }: { actions: MessageAction[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-700/50 pt-2.5">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={action.onClick}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition-all hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-indigo-300"
        >
          <action.icon className="h-3 w-3" />
          {action.label}
        </button>
      ))}
    </div>
  );
}

function SuggestedFollowUps({
  suggestions,
  onSelect,
  disabled,
}: {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => onSelect(suggestion)}
          disabled={disabled}
          className="rounded-full border border-slate-700/50 bg-slate-800/30 px-2.5 py-1 text-[11px] text-slate-400 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/5 hover:text-indigo-300 disabled:opacity-40"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

function AgentCapabilities({ agentId }: { agentId: string }) {
  const capabilities = agentCapabilities[agentId] ?? [];
  if (capabilities.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Sparkles className="h-3 w-3 text-indigo-400" />
        This agent can...
      </p>
      <ul className="space-y-1">
        {capabilities.map((cap) => (
          <li key={cap} className="flex items-start gap-1.5 text-[11px] text-slate-400">
            <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
            {cap}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConversationHistory({
  conversations,
  currentConversationId,
  onSelect,
  onDelete,
  onNew,
}: {
  conversations: Conversation[];
  currentConversationId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  // Collapsed by default so the conversation list never crowds out the agent
  // roster above it.
  const [expanded, setExpanded] = useState(false);

  const sortedConversations = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-2 pb-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-300"
        >
          <History className="h-3 w-3" />
          History
          <ChevronDown className={cn('h-3 w-3 transition-transform', !expanded && '-rotate-90')} />
        </button>
        <button
          onClick={onNew}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-indigo-400 transition-colors hover:bg-indigo-500/10"
        >
          <Plus className="h-3 w-3" />
          New
        </button>
      </div>

      {expanded && (
        <div className="max-h-52 space-y-0.5 overflow-y-auto pr-0.5">
          {sortedConversations.length === 0 ? (
            <p className="px-2 py-3 text-center text-[11px] text-slate-600">No conversations yet</p>
          ) : (
            sortedConversations.map((conv) => {
              const isActive = conv.id === currentConversationId;
              const lastMessage = conv.messages[conv.messages.length - 1];
              const preview = lastMessage
                ? lastMessage.content.slice(0, 40) || lastMessage.fileName || 'No content'
                : 'No messages';

              return (
                <div
                  key={conv.id}
                  className={cn(
                    'group flex items-center gap-2 rounded-lg px-2 py-2 transition-all',
                    isActive
                      ? 'bg-indigo-500/10 ring-1 ring-indigo-500/20'
                      : 'hover:bg-slate-800/50'
                  )}
                >
                  <button
                    onClick={() => onSelect(conv.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <MessageSquare className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-indigo-400' : 'text-slate-500')} />
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-[11px] font-medium', isActive ? 'text-white' : 'text-slate-300')}>
                        {conv.title}
                      </p>
                      <p className="truncate text-[10px] text-slate-500">{preview}</p>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(conv.id);
                    }}
                    className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 transition-all hover:bg-slate-700 hover:text-red-400 group-hover:opacity-100"
                    title="Delete conversation"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function loadConversationsFromStorage(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Conversation[];
    // Drop message action buttons: icons/handlers can't survive JSON
    // serialization and would crash rendering if revived as dead objects.
    // Also repair any duplicate message ids saved by older sessions.
    return parsed.map((conv) => ({
      ...conv,
      messages: dedupeMessageIds(conv.messages).map((msg) => ({ ...msg, actions: undefined })),
    }));
  } catch {
    return [];
  }
}

function saveConversationsToStorage(conversations: Conversation[]) {
  if (typeof window === 'undefined') return;
  try {
    // Strip action buttons before persisting — they hold live icon
    // components and onClick handlers that JSON can't serialize.
    // They're rebuilt when a new assistant message streams in.
    const storable = conversations.map((conv) => ({
      ...conv,
      messages: conv.messages.map((msg) => ({ ...msg, actions: undefined })),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storable));
  } catch {
    // Storage full or unavailable
  }
}

// Impure helpers live at module scope (outside the component) so event
// handlers and lazy state initializers can use timestamps/ids without
// violating render purity rules.
function now(): number {
  return Date.now();
}

// False during SSR / first client render, true after hydration — lets us
// render a stable placeholder until client-only state (localStorage) is
// available, avoiding hydration mismatches.
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

// Message ids (`msg-N`) must stay unique across reloads: the per-session
// counter restarts at 0, but stored history may already contain those ids.
function dedupeMessageIds(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  return messages.map((msg) => {
    if (!seen.has(msg.id)) {
      seen.add(msg.id);
      return msg;
    }
    let n = 1;
    let id = `${msg.id}-dup-${n}`;
    while (seen.has(id)) {
      n += 1;
      id = `${msg.id}-dup-${n}`;
    }
    seen.add(id);
    return { ...msg, id };
  });
}

function maxMessageId(conversations: Conversation[]): number {
  let max = 0;
  for (const conv of conversations) {
    for (const m of conv.messages) {
      const match = /^msg-(\d+)$/.exec(m.id);
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  return max;
}

function getInitialChatState(): { conversations: Conversation[]; currentConversationId: string } {
  const stored = loadConversationsFromStorage();
  if (stored.length > 0) {
    return { conversations: stored, currentConversationId: stored[0].id };
  }
  const initialConversation: Conversation = {
    id: generateId('conv'),
    agentId: agents[0].id,
    title: `Chat with ${agents[0].name}`,
    messages: [makeWelcomeMessage(agents[0])],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return { conversations: [initialConversation], currentConversationId: initialConversation.id };
}

type LiveChatResult = {
  content: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
};

/** Split a reply into its think-aloud block (leading ▸ lines) and answer. */
function splitThinking(content: string): { thinking: string; answer: string } {
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  const start = i;
  while (i < lines.length && lines[i].startsWith('▸')) i++;
  if (i === start) return { thinking: '', answer: content };
  return { thinking: lines.slice(start, i).join('\n'), answer: lines.slice(i).join('\n').trimStart() };
}

function AssistantContent({ content, streaming }: { content: string; streaming?: boolean }) {
  const { thinking, answer } = splitThinking(content);
  return (
    <div className="relative">
      {thinking && (
        <details
          open={streaming}
          className="mb-2 rounded-lg border border-slate-700/50 bg-slate-900/60 px-3 py-2"
        >
          <summary className="cursor-pointer text-[11px] font-medium text-slate-400 hover:text-slate-200">
            Reasoning{streaming ? '…' : ''}
          </summary>
          <div className="mt-1.5 space-y-0.5 font-mono text-[11px] leading-relaxed text-slate-400">
            {thinking.split('\n').map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
          </div>
        </details>
      )}
      <MarkdownRenderer content={answer} />
      {streaming && (
        <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-indigo-400 align-text-bottom" />
      )}
    </div>
  );
}

/**
 * Streams a live reply from the configured LLM backend through /api/chat.
 * Resolves with the authoritative full content from the `done` frame
 * (covers providers that buffer instead of streaming deltas).
 */
async function streamLiveChat(
  conversationId: string,
  content: string,
  onDelta: (text: string) => void,
  onLog?: (line: string) => void
): Promise<LiveChatResult> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, message: content }),
  });

  if (!response.ok || !response.body) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(
      (errBody as { error?: string }).error || `Chat request failed (${response.status})`
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const result: LiveChatResult = { content: '' };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      let event: {
        type: string;
        text?: string;
        line?: string;
        content?: string;
        message?: string;
        error?: string;
        model?: string;
        tokens?: { input?: number; output?: number };
        latencyMs?: number;
      };
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (event.type === 'delta' && event.text) {
        result.content += event.text;
        onDelta(event.text);
      } else if (event.type === 'log' && (event.text || event.line)) {
        onLog?.(event.text ?? event.line ?? '');
      } else if (event.type === 'error') {
        throw new Error(event.message ?? event.error ?? 'Live request failed');
      } else if (event.type === 'done') {
        if (typeof event.content === 'string' && event.content) result.content = event.content;
        result.model = event.model;
        result.inputTokens = event.tokens?.input;
        result.outputTokens = event.tokens?.output;
        result.latencyMs = event.latencyMs;
      }
    }
  }
  return result;
}

export default function ChatPage() {
  const [initialChatState] = useState(getInitialChatState);
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0].id);
  const [demoMode, setDemoMode] = useState(false);
  // Health of the live backend (probed on mount and when toggling live).
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [backendLabel, setBackendLabel] = useState('live model');
  const [conversations, setConversations] = useState<Conversation[]>(initialChatState.conversations);
  const [currentConversationId, setCurrentConversationId] = useState<string>(
    initialChatState.currentConversationId
  );
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set());
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number; type: string } | null>(null);

  const router = useRouter();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Seed from stored history so new ids never collide with restored ones.
  const idCounter = useRef(maxMessageId(initialChatState.conversations));
  const mounted = useMounted();

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? agents[0];
  const AgentIcon = categoryIcons[selectedAgent.category] ?? Bot;

  const currentConversation = conversations.find((c) => c.id === currentConversationId);
  const messages = useMemo(() => currentConversation?.messages ?? [], [currentConversation]);

  const nextId = () => {
    idCounter.current += 1;
    return `msg-${idCounter.current}`;
  };

  useEffect(() => {
    if (conversations.length > 0) {
      saveConversationsToStorage(conversations);
    }
  }, [conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Probe the configured LLM backend once on mount so the status panel
  // reflects the real provider (OpenCode or a direct OpenAI-compatible host).
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const res = await fetch('/api/chat');
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          label?: string;
        };
        if (cancelled) return;
        setBackendOk(Boolean(body.ok));
        if (typeof body.label === 'string' && body.label) setBackendLabel(body.label);
      } catch {
        if (!cancelled) setBackendOk(false);
      }
    };
    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateConversation = useCallback(
    (conversationId: string, updater: (conv: Conversation) => Conversation) => {
      setConversations((prev) =>
        prev.map((conv) => (conv.id === conversationId ? updater(conv) : conv))
      );
    },
    []
  );

  const selectAgent = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent || agentId === selectedAgentId) return;

    setSelectedAgentId(agentId);
    setInput('');
    setUploadedFile(null);
    setIsThinking(false);
    setIsStreaming(false);

    const existingConv = conversations.find((c) => c.agentId === agentId);
    if (existingConv) {
      setCurrentConversationId(existingConv.id);
    } else {
      const newConv: Conversation = {
        id: generateId('conv'),
        agentId: agent.id,
        title: `Chat with ${agent.name}`,
        messages: [makeWelcomeMessage(agent)],
        createdAt: now(),
        updatedAt: now(),
      };
      setConversations((prev) => [newConv, ...prev]);
      setCurrentConversationId(newConv.id);
    }
  };

  const createNewConversation = () => {
    const newConv: Conversation = {
      id: generateId('conv'),
      agentId: selectedAgentId,
      title: `Chat with ${selectedAgent.name}`,
      messages: [makeWelcomeMessage(selectedAgent)],
      createdAt: now(),
      updatedAt: now(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setCurrentConversationId(newConv.id);
    setInput('');
    setUploadedFile(null);
  };

  const deleteConversation = (id: string) => {
    const next = conversations.filter((c) => c.id !== id);
    if (id === currentConversationId) {
      if (next.length > 0) {
        setCurrentConversationId(next[0].id);
        setConversations(next);
      } else {
        const newConv: Conversation = {
          id: generateId('conv'),
          agentId: selectedAgentId,
          title: `Chat with ${selectedAgent.name}`,
          messages: [makeWelcomeMessage(selectedAgent)],
          createdAt: now(),
          updatedAt: now(),
        };
        setConversations([newConv]);
        setCurrentConversationId(newConv.id);
      }
      return;
    }
    setConversations(next);
  };

  const handleDemoToggle = async (checked: boolean) => {
    setDemoMode(checked);
    if (!checked) {
      try {
        const res = await fetch('/api/chat');
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          label?: string;
        };
        setBackendOk(res.ok);
        if (typeof body.label === 'string' && body.label) setBackendLabel(body.label);
      } catch {
        setBackendOk(false);
      }
    }
  };

  const runLiveAssistant = async (conversationId: string, userContent: string) => {
    setIsThinking(false);
    setIsStreaming(true);
    const messageId = nextId();
    updateConversation(conversationId, (conv) => ({
      ...conv,
      messages: [
        ...conv.messages,
        {
          id: messageId,
          role: 'assistant',
          content: '',
          executionTime: 0,
          trace: [`Live inference via ${backendLabel}`],
          streaming: true,
          timestamp: now(),
        },
      ],
      updatedAt: now(),
    }));

    const setContent = (text: string) =>
      updateConversation(conversationId, (conv) => ({
        ...conv,
        messages: conv.messages.map((m) => (m.id === messageId ? { ...m, content: text } : m)),
      }));
    const appendTrace = (line: string) =>
      updateConversation(conversationId, (conv) => ({
        ...conv,
        messages: conv.messages.map((m) =>
          m.id === messageId ? { ...m, trace: [...(m.trace ?? []), line] } : m
        ),
      }));
    const finalize = (live: LiveChatResult) => {
      const execTime = live.latencyMs ? Math.round((live.latencyMs / 1000) * 10) / 10 : 0;
      updateConversation(conversationId, (conv) => ({
        ...conv,
        messages: conv.messages.map((m) =>
          m.id === messageId
            ? {
                ...m,
                content: live.content || m.content,
                streaming: false,
                executionTime: execTime,
                trace: [
                  `Live inference via ${backendLabel}`,
                  ...(live.model ? [`Model: ${live.model}`] : []),
                  ...(live.outputTokens !== undefined
                    ? [`Tokens: ${live.inputTokens ?? 0} in / ${live.outputTokens} out`]
                    : []),
                ],
              }
            : m
        ),
      }));
    };

    // Progressive reveal: deltas accumulate into `target` as they arrive and
    // the UI paces toward it (~60 chars per tick). Genuine trickles pass
    // through near-instantly; buffered bursts type out instead of popping.
    let target = '';
    let revealed = '';
    let doneOk = false;
    let final: LiveChatResult | null = null;
    const revealTimer = setInterval(() => {
      if (revealed.length < target.length) {
        let end = revealed.length + 60;
        if (end < target.length) {
          const sp = target.indexOf(' ', end);
          end = sp === -1 ? target.length : sp;
        }
        revealed = target.slice(0, end);
        setContent(revealed);
      } else if (doneOk && final) {
        clearInterval(revealTimer);
        finalize(final);
      }
    }, 45);

    try {
      final = await streamLiveChat(
        conversationId,
        userContent,
        (chunk) => {
          target += chunk;
        },
        (line) => appendTrace(line)
      );
      doneOk = true;
      if (revealed === target) {
        clearInterval(revealTimer);
        finalize(final);
      }
    } catch (error) {
      clearInterval(revealTimer);
      const errMessage = error instanceof Error ? error.message : 'Live request failed';
      updateConversation(conversationId, (conv) => ({
        ...conv,
        messages: conv.messages.map((m) =>
          m.id === messageId
            ? {
                ...m,
                content: `Live backend unavailable — ${errMessage}. Turn on Demo Mode for simulated responses.`,
                confidence: 0,
                streaming: false,
              }
            : m
        ),
      }));
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content && !uploadedFile) return;
    if (isThinking || isStreaming) return;
    if (!currentConversationId) return;

    const userMessage: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: content || (uploadedFile ? `Uploaded: ${uploadedFile.name}` : ''),
      fileName: uploadedFile?.name,
      fileSize: uploadedFile?.size,
      fileType: uploadedFile?.type,
      timestamp: now(),
    };

    updateConversation(currentConversationId, (conv) => ({
      ...conv,
      messages: [...conv.messages, userMessage],
      updatedAt: now(),
      title: conv.messages.length <= 1 ? content.slice(0, 40) : conv.title,
    }));

    setInput('');
    setUploadedFile(null);
    setIsThinking(true);

    const conversationHistory = [...messages, userMessage];

    try {
      if (demoMode) {
        await sleep(1000);
        setIsThinking(false);
        setIsStreaming(true);

        const { content: responseContent, confidence, trace } = buildMockResponse(
          selectedAgent,
          content,
          conversationHistory
        );
        const messageId = nextId();

        const messageActions: MessageAction[] = [
          {
            label: 'View in Portfolio',
            icon: PieChart,
            onClick: () => {
              router.push('/portfolio');
            },
          },
          {
            label: 'Export to PDF',
            icon: Download,
            onClick: () => {
              window.print();
            },
          },
          {
            label: 'Create HITL Request',
            icon: AlertTriangle,
            onClick: () => {
              router.push('/approvals');
            },
          },
        ];

        updateConversation(currentConversationId, (conv) => ({
          ...conv,
          messages: [
            ...conv.messages,
            {
              id: messageId,
              role: 'assistant',
              content: '',
              confidence,
              executionTime: 0,
              policyChecks: [
                { name: 'cosign', status: 'passed', details: 'Image signed by registry.realtomatic.ai' },
                { name: 'sbom', status: 'passed', details: 'No vulnerabilities found' },
                { name: 'seccomp', status: 'passed', details: `${selectedAgent.seccompProfile} profile active` },
              ],
              trace,
              streaming: true,
              timestamp: Date.now(),
              actions: messageActions,
            },
          ],
          updatedAt: Date.now(),
        }));

        const words = responseContent.split(' ');
        let accumulated = '';
        for (let i = 0; i < words.length; i++) {
          accumulated += (i === 0 ? '' : ' ') + words[i];
          const current = accumulated;
          updateConversation(currentConversationId, (conv) => ({
            ...conv,
            messages: conv.messages.map((m) => (m.id === messageId ? { ...m, content: current } : m)),
          }));
          await sleep(20);
        }

        const execTime = 4.2;
        updateConversation(currentConversationId, (conv) => ({
          ...conv,
          messages: conv.messages.map((m) =>
            m.id === messageId ? { ...m, streaming: false, executionTime: execTime } : m
          ),
        }));
        setIsStreaming(false);
      } else {
        await runLiveAssistant(currentConversationId, content);
      }
    } catch {
      setIsThinking(false);
      setIsStreaming(false);
      updateConversation(currentConversationId, (conv) => ({
        ...conv,
        messages: [
          ...conv.messages,
          {
            id: nextId(),
            role: 'assistant',
            content: 'Sorry, I encountered an error processing your request. Please try again.',
            confidence: 0,
            timestamp: Date.now(),
          },
        ],
      }));
    }
  };

  const handleRegenerate = async () => {
    if (isThinking || isStreaming) return;
    if (!currentConversationId) return;

    const conv = conversations.find((c) => c.id === currentConversationId);
    if (!conv) return;

    const lastAssistantIndex = conv.messages.map((m) => m.role).lastIndexOf('assistant');
    if (lastAssistantIndex === -1) return;

    const lastUserIndex = conv.messages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIndex === -1) return;

    const lastUser = conv.messages[lastUserIndex];

    updateConversation(currentConversationId, (c) => ({
      ...c,
      messages: c.messages.slice(0, lastAssistantIndex),
    }));

    setIsThinking(true);

    const conversationHistory = conv.messages.slice(0, lastAssistantIndex);

    try {
      if (demoMode) {
        await sleep(1000);
        setIsThinking(false);
        setIsStreaming(true);

        const { content: responseContent, confidence, trace } = buildMockResponse(
          selectedAgent,
          lastUser.content,
          conversationHistory
        );
        const messageId = nextId();

        const messageActions: MessageAction[] = [
          {
            label: 'View in Portfolio',
            icon: PieChart,
            onClick: () => {
              router.push('/portfolio');
            },
          },
          {
            label: 'Export to PDF',
            icon: Download,
            onClick: () => {
              window.print();
            },
          },
          {
            label: 'Create HITL Request',
            icon: AlertTriangle,
            onClick: () => {
              router.push('/approvals');
            },
          },
        ];

        updateConversation(currentConversationId, (c) => ({
          ...c,
          messages: [
            ...c.messages,
            {
              id: messageId,
              role: 'assistant',
              content: '',
              confidence,
              executionTime: 0,
              policyChecks: [
                { name: 'cosign', status: 'passed', details: 'Image signed by registry.realtomatic.ai' },
                { name: 'sbom', status: 'passed', details: 'No vulnerabilities found' },
                { name: 'seccomp', status: 'passed', details: `${selectedAgent.seccompProfile} profile active` },
              ],
              trace,
              streaming: true,
              timestamp: Date.now(),
              actions: messageActions,
            },
          ],
          updatedAt: Date.now(),
        }));

        const words = responseContent.split(' ');
        let accumulated = '';
        for (let i = 0; i < words.length; i++) {
          accumulated += (i === 0 ? '' : ' ') + words[i];
          const current = accumulated;
          updateConversation(currentConversationId, (c) => ({
            ...c,
            messages: c.messages.map((m) => (m.id === messageId ? { ...m, content: current } : m)),
          }));
          await sleep(20);
        }

        updateConversation(currentConversationId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === messageId ? { ...m, streaming: false, executionTime: 4.2 } : m
          ),
        }));
        setIsStreaming(false);
      } else {
        await runLiveAssistant(currentConversationId, lastUser.content);
      }
    } catch {
      setIsThinking(false);
      setIsStreaming(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile({
        name: file.name,
        size: file.size,
        type: file.type,
      });
    }
    e.target.value = '';
  };

  const toggleTrace = (id: string) => {
    setExpandedTraces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  };

  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  const suggestions = suggestedFollowUps[selectedAgentId] ?? [];

  // The initial state is seeded from localStorage, which doesn't exist
  // during SSR — the server renders the default welcome conversation while
  // the client would render stored ones. Gate the real UI behind hydration
  // so server and first client render always match.
  if (!mounted) {
    return (
      <AppLayout title="AI Assistant">
        <PageLoading
          message="Loading conversations..."
          className="min-h-[calc(100vh-4rem)] rounded-xl border border-slate-800 bg-slate-900/60"
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout title="AI Assistant">
      <div className="flex h-[calc(100vh-4rem)] gap-4">
        {/* Left Sidebar */}
        <div className="hidden w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 lg:flex">
          {/* Demo Mode Toggle */}
          <div className="border-b border-slate-800 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-400" />
                <span className="text-sm font-medium text-white">Demo Mode</span>
              </div>
              <Switch checked={demoMode} onCheckedChange={(v) => void handleDemoToggle(v)} />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              {demoMode
                ? 'Using simulated responses'
                : backendOk === false
                  ? 'Backend unreachable — responses will fail'
                  : `Live inference · ${backendLabel}`}
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2">
              <div
                className={cn(
                  'h-2 w-2 rounded-full',
                  demoMode ? 'bg-amber-400' : backendOk === false ? 'bg-red-400' : 'bg-emerald-400'
                )}
              />
              <span className="text-xs font-medium text-slate-300">
                Provider: {demoMode ? 'Demo (simulated)' : backendLabel}
              </span>
            </div>
          </div>

          {/* Agent List */}
          <div className="flex-1 overflow-y-auto p-3">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Agents
            </p>
            <div className="space-y-1">
              {agents.map((agent) => {
                const Icon = categoryIcons[agent.category] ?? Bot;
                const isSelected = agent.id === selectedAgentId;
                return (
                  <button
                    key={agent.id}
                    onClick={() => selectAgent(agent.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all',
                      isSelected
                        ? 'bg-indigo-500/15 ring-1 ring-indigo-500/30'
                        : 'hover:bg-slate-800/50'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                        isSelected ? categoryAccent[agent.category] : 'border-slate-700 bg-slate-800 text-slate-400'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-sm font-medium', isSelected ? 'text-white' : 'text-slate-300')}>
                        {agent.name}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">v{agent.version}</p>
                    </div>
                    {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-indigo-400" />}
                  </button>
                );
              })}
            </div>

            {/* Agent Capabilities */}
            <div className="mt-4">
              <AgentCapabilities agentId={selectedAgentId} />
            </div>
          </div>

          {/* Conversation History */}
          <div className="border-t border-slate-800 p-3">
            <ConversationHistory
              conversations={conversations}
              currentConversationId={currentConversationId}
              onSelect={setCurrentConversationId}
              onDelete={deleteConversation}
              onNew={createNewConversation}
            />
          </div>

          {/* Agent Info */}
          <div className="flex shrink-0 items-center gap-3 border-t border-slate-800 px-4 py-2.5 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              {selectedAgent.seccompProfile}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Globe className="h-3 w-3 text-blue-400" />
              {selectedAgent.egressAllowlist.length} egress rules
            </span>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-slate-800 bg-slate-900/60">
          {/* Chat Header */}
          <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
            <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg border', categoryAccent[selectedAgent.category])}>
              <AgentIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-white">{selectedAgent.name}</h2>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                  v{selectedAgent.version}
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">{selectedAgent.description}</p>
            </div>
            <div className="hidden items-center gap-3 text-xs text-slate-500 sm:flex">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {selectedAgent.avgExecutionTime}s avg
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                {selectedAgent.successRate}%
              </span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className={cn('mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', categoryAccent[selectedAgent.category])}>
                      <AgentIcon className="h-4 w-4" />
                    </div>
                  )}
                  <div className={cn('max-w-[85%]', msg.role === 'user' ? 'order-first' : '')}>
                    {msg.role === 'user' ? (
                      <div>
                        <div className="rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">
                          {msg.fileName && (
                            <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-slate-900/5 px-2.5 py-1.5 text-xs">
                              <FileText className="h-3.5 w-3.5" />
                              {msg.fileName}
                            </div>
                          )}
                          {msg.content}
                        </div>
                        <div className="mt-1 flex justify-end">
                          <MessageTimestamp timestamp={msg.timestamp} />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="rounded-2xl rounded-tl-sm border border-slate-700/50 bg-slate-800/50 px-4 py-3">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-300">{selectedAgent.name}</span>
                            {msg.confidence !== undefined && msg.confidence > 0 && (
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                                  msg.confidence >= 0.9
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : msg.confidence >= 0.7
                                      ? 'bg-amber-500/15 text-amber-400'
                                      : 'bg-red-500/15 text-red-400'
                                )}
                              >
                                {Math.round(msg.confidence * 100)}% confidence
                              </span>
                            )}
                            {msg.executionTime !== undefined && msg.executionTime > 0 && (
                              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                                <Clock className="h-3 w-3" />
                                {msg.executionTime.toFixed(1)}s
                              </span>
                            )}
                          </div>

                          {msg.content ? (
                            <AssistantContent content={msg.content} streaming={msg.streaming} />
                          ) : (
                            <TypingIndicator agentName={selectedAgent.name} />
                          )}

                          {msg.policyChecks && msg.policyChecks.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-700/50 pt-2.5">
                              {msg.policyChecks.map((check) => (
                                <PolicyCheckIcon key={check.name} check={check} />
                              ))}
                            </div>
                          )}

                          {msg.trace && msg.trace.length > 0 && (
                            <div className="mt-2.5 border-t border-slate-700/50 pt-2">
                              <button
                                onClick={() => toggleTrace(msg.id)}
                                className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-300"
                              >
                                <Terminal className="h-3 w-3" />
                                Execution trace
                                <ChevronDown
                                  className={cn('h-3 w-3 transition-transform', expandedTraces.has(msg.id) && 'rotate-180')}
                                />
                              </button>
                              {expandedTraces.has(msg.id) && (
                                <div className="mt-2 space-y-1 rounded-lg border border-slate-700/50 bg-slate-900/60 p-2.5 font-mono text-[10px] text-slate-400">
                                  {msg.trace.map((step, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <span className="text-slate-600">{String(i + 1).padStart(2, '0')}</span>
                                      <span className={cn(i === 0 && 'text-blue-400')}>{step}</span>
                                    </div>
                                  ))}
                                  <div className="mt-1.5 flex items-center gap-2 border-t border-slate-800 pt-1.5 text-slate-500">
                                    <Zap className="h-3 w-3 text-amber-400" />
                                    Total: {msg.executionTime?.toFixed(1) ?? '—'}s
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {msg.actions && msg.actions.length > 0 && !msg.streaming && (
                            <ActionButtons actions={msg.actions} />
                          )}
                        </div>

                        {/* Message footer with timestamp and actions */}
                        <div className="mt-1.5 flex items-center gap-2">
                          <MessageTimestamp timestamp={msg.timestamp} />
                          <div className="ml-auto flex items-center gap-1">
                            <CopyButton text={msg.content} />
                            {msg.id === lastAssistantMessage?.id && (
                              <RegenerateButton onRegenerate={handleRegenerate} disabled={isThinking || isStreaming} />
                            )}
                          </div>
                        </div>

                        {/* Suggested follow-ups */}
                        {msg.id === lastAssistantMessage?.id && !msg.streaming && msg.content && (
                          <SuggestedFollowUps
                            suggestions={suggestions}
                            onSelect={(s) => handleSend(s)}
                            disabled={isThinking || isStreaming}
                          />
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-slate-300">
                      <span className="text-xs font-bold">MB</span>
                    </div>
                  )}
                </div>
              ))}

              {isThinking && (
                <div className="flex gap-3">
                  <div className={cn('mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', categoryAccent[selectedAgent.category])}>
                    <AgentIcon className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm border border-slate-700/50 bg-slate-800/50 px-4 py-2">
                    <TypingIndicator agentName={selectedAgent.name} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="border-t border-slate-800 px-4 pt-3">
            <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleSend(action.label)}
                  disabled={isThinking || isStreaming}
                  className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-indigo-300 disabled:opacity-50"
                >
                  <action.icon className="h-3 w-3" />
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input Area */}
          <div className="px-4 pb-4 pt-2">
            <div className="mx-auto max-w-3xl">
              {uploadedFile && (
                <FilePreviewCard
                  name={uploadedFile.name}
                  size={uploadedFile.size}
                  type={uploadedFile.type}
                  onRemove={() => setUploadedFile(null)}
                />
              )}
              <div className="flex items-end gap-2 rounded-xl border border-slate-700 bg-slate-800/50 p-2 transition-colors focus-within:border-indigo-500/50">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
                  title="Upload document"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleTextareaInput}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${selectedAgent.name}...`}
                  rows={1}
                  className="max-h-40 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={(!input.trim() && !uploadedFile) || isThinking || isStreaming}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition-all hover:bg-indigo-500 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] text-slate-600">
                AI can make mistakes. Verify important information.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
