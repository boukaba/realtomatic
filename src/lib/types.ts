export type PropertyType = 'office' | 'retail' | 'industrial' | 'multifamily' | 'mixed-use';

export interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  type: PropertyType;
  sqFt: number;
  occupancy: number;
  value: number;
  imageUrl: string;
  yearBuilt: number;
  amenities: string[];
  tenantId: string;
}

export type LeaseType = 'NNN' | 'Gross' | 'Modified Gross' | 'Percentage Rent';
export type LeaseStatus = 'active' | 'expiring' | 'expired' | 'pending';

export type LeaseClauseType =
  | 'rent'
  | 'term'
  | 'renewal'
  | 'CAM'
  | 'co-tenancy'
  | 'termination'
  | 'assignment'
  | 'maintenance'
  | 'insurance'
  | 'default';

export interface LeaseClause {
  id: string;
  type: LeaseClauseType;
  title: string;
  content: string;
  isStandard: boolean;
  confidence: number;
}

export interface Lease {
  id: string;
  propertyId: string;
  tenantName: string;
  tenantIndustry: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  totalSqFt: number;
  leaseType: LeaseType;
  status: LeaseStatus;
  clauses: LeaseClause[];
  confidence: number;
  extractedAt: string;
  documentUrl: string;
}

export type AgentStatus = 'running' | 'idle' | 'error' | 'deploying';
export type AgentCategory =
  | 'lease'
  | 'valuation'
  | 'market'
  | 'portfolio'
  | 'maintenance'
  | 'tenant'
  | 'document'
  | 'esg'
  | 'insurance'
  | 'tax'
  | 'email'
  | 'lead'
  | 'data';

export interface HibernationStats {
  state: 'active' | 'hibernating';
  lastHibernatedAt: string;
  wakeUpTimeMs: number;
  costSavedThisMonth: number;
  policy: string;
}

export interface Agent {
  id: string;
  name: string;
  version: string;
  description: string;
  status: AgentStatus;
  image: string;
  signature: string;
  seccompProfile: string;
  egressAllowlist: string[];
  maxDuration: number;
  maxMemory: number;
  maxCpu: number;
  tasksToday: number;
  avgExecutionTime: number;
  successRate: number;
  lastRun: string;
  category: AgentCategory;
  icon: string;
  hibernationEnabled: boolean;
  hibernationStats: HibernationStats;
}

export type WorkflowStatus = 'running' | 'completed' | 'failed' | 'pending_approval';
export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval';

export interface WorkflowStep {
  id: string;
  name: string;
  agentName: string;
  status: WorkflowStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  input: string;
  output: string | null;
  confidence: number | null;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  startedAt: string;
  completedAt: string | null;
  triggeredBy: string;
  agentId: string;
}

export interface MarketData {
  id: string;
  city: string;
  state: string;
  propertyType: PropertyType;
  medianRent: number;
  rentGrowth: number;
  vacancyRate: number;
  absorption: number;
  capRate: number;
  populationGrowth: number;
  jobGrowth: number;
  timestamp: string;
}

export interface TopMarket {
  city: string;
  state: string;
  value: number;
  growth: number;
}

export interface RecentActivity {
  id: string;
  type: 'lease' | 'valuation' | 'maintenance' | 'market' | 'tenant';
  message: string;
  timestamp: string;
}

export interface CostSavings {
  hibernation: number;
  total: number;
}

export interface PortfolioSummary {
  totalProperties: number;
  totalValue: number;
  totalLeases: number;
  avgOccupancy: number;
  expiringLeases90Days: number;
  monthlyRevenue: number;
  yoyGrowth: number;
  topMarkets: TopMarket[];
  recentActivity: RecentActivity[];
  costSavings: CostSavings;
}

export interface EmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  timestamp: string;
  isAgentSent: boolean;
}

export interface EmailThread {
  id: string;
  agentId: string;
  subject: string;
  participants: string[];
  status: 'awaiting_reply' | 'replied' | 'extracted' | 'completed';
  emails: EmailMessage[];
  extractedDetails?: string;
  createdAt: string;
  updatedAt: string;
}

export type HITLType = 'approval' | 'review' | 'escalation';
export type HITLStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested';
export type HITLPriority = 'low' | 'medium' | 'high' | 'critical';

export interface HITLRequest {
  id: string;
  agentId: string;
  agentName: string;
  type: HITLType;
  title: string;
  description: string;
  data: Record<string, unknown>;
  confidence: number;
  status: HITLStatus;
  requestedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  priority: HITLPriority;
}

export type ExecutionStatus = 'success' | 'failed' | 'running';

export interface PolicyCheck {
  name: 'cosign' | 'sbom' | 'seccomp' | 'egress' | 'secrets';
  status: 'passed' | 'failed' | 'warning';
  details: string;
}

export interface AgentExecution {
  id: string;
  agentId: string;
  agentName: string;
  input: string;
  output: string;
  status: ExecutionStatus;
  duration: number;
  timestamp: string;
  confidence: number;
  vmId: string;
  policyChecks: PolicyCheck[];
}

export type UserRole = 'admin' | 'analyst' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  organization: string;
}

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export type LeadSource = 'Zillow' | 'Realtor.com' | 'Website' | 'Referral' | 'Apartments.com';
export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Booked';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: LeadSource;
  score: number;
  status: LeadStatus;
  assignedAgent: string;
  propertyInterest: string;
  budget: string;
  message: string;
  createdAt: string;
}

export interface LeadSourceROI {
  source: string;
  conversionRate: number;
  leads: number;
  tours: number;
  deals: number;
}

export interface IntegrationSettings {
  email: { id: string; provider: string; enabled: boolean }[];
  calendar: { id: string; provider: string; enabled: boolean }[];
  leadSources: { id: string; source: string; enabled: boolean }[];
  chatWidget: { enabled: boolean; embedCode: string };
  apiKeys: { id: string; name: string; key: string; createdAt: string; lastUsed: string }[];
}

export type AIProvider = 'demo' | 'openai' | 'anthropic' | 'google';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}
