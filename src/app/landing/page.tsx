'use client';

import { useState } from 'react';
import {
  Shield,
  FileText,
  Calculator,
  TrendingUp,
  Target,
  Lock,
  Play,
  ArrowRight,
  Upload,
  Cpu,
  CheckCircle2,
  Check,
  Sparkles,
  Building2,
  Zap,
  Globe,
  Moon,
  Mail,
  MessageSquare,
  CalendarCheck,
  Bell,
} from 'lucide-react';

const stats = [
  { value: '247', label: 'Properties Managed' },
  { value: '$1.2B', label: 'Assets Under Management' },
  { value: '90%', label: 'Lower Compute Costs' },
  { value: 'SOC 2', label: 'Ready · GDPR Compliant' },
];

const features = [
  {
    icon: Shield,
    title: 'Firecracker MicroVM Isolation',
    description: 'Every agent runs in an isolated microVM with its own kernel — zero cross-tenant data leakage, ever.',
    accent: 'from-emerald-400 to-teal-500',
  },
  {
    icon: FileText,
    title: 'Lease Abstraction',
    description: 'Extract structured data from any lease in seconds. 400+ clause types recognized across 12 languages.',
    accent: 'from-blue-400 to-indigo-500',
  },
  {
    icon: Calculator,
    title: 'Valuation Engine',
    description: 'NPV, IRR, and comparable analysis computed in real time with full audit trails and assumptions.',
    accent: 'from-violet-400 to-purple-500',
  },
  {
    icon: TrendingUp,
    title: 'Market Intelligence',
    description: 'Real-time market trends, rent forecasts, and cap-rate signals across 300+ metros.',
    accent: 'from-amber-400 to-orange-500',
  },
  {
    icon: Target,
    title: 'Portfolio Optimization',
    description: 'AI-driven buy/sell/hold recommendations tuned to your risk profile and return targets.',
    accent: 'from-rose-400 to-pink-500',
  },
  {
    icon: Moon,
    title: 'Agent Hibernation',
    description: 'Agents sleep when idle and wake in 200ms at the same memory state — 90% lower compute costs vs always-on VMs.',
    accent: 'from-indigo-400 to-violet-500',
  },
  {
    icon: Mail,
    title: 'Email Outreach',
    description: 'Agents email landlords and realty professionals, wait for replies, extract willingness and details, and continue workflows.',
    accent: 'from-emerald-400 to-teal-500',
  },
  {
    icon: MessageSquare,
    title: 'Lead Intelligence',
    description: 'AI responds to every inquiry instantly, scores leads, and books tours automatically.',
    accent: 'from-rose-400 to-pink-500',
  },
  {
    icon: Lock,
    title: 'Enterprise Security',
    description: 'SOC 2 Type II, ISO 27001, and GDPR compliant. Your data is encrypted at rest and in transit.',
    accent: 'from-cyan-400 to-sky-500',
  },
];

const steps = [
  {
    icon: Upload,
    step: '01',
    title: 'Upload',
    description: 'Drop leases, rent rolls, or connect your PMS. Agents ingest everything in minutes.',
  },
  {
    icon: Cpu,
    step: '02',
    title: 'Agents Process',
    description: 'Isolated agents abstract, value, and analyze — each in its own Firecracker microVM.',
  },
  {
    icon: CheckCircle2,
    step: '03',
    title: 'Review & Approve',
    description: 'Approve outputs with one click. Every decision is logged and fully auditable.',
  },
];

const whyWins = [
  {
    icon: Lock,
    title: 'Content-Addressed DAG Store',
    description: 'Zero-copy, deduplicated storage with P2P sync — every artifact is content-hashed and tamper-evident.',
  },
  {
    icon: Shield,
    title: 'Firecracker microVM Per Task',
    description: 'Each agent task boots its own microVM with a dedicated kernel — no shared kernel, no escape path.',
  },
  {
    icon: FileText,
    title: 'Policy Engine',
    description: 'Cosign signatures, SBOM CVSS scoring, seccomp profiles, and egress controls enforced on every run.',
  },
  {
    icon: CheckCircle2,
    title: 'AES-256-GCM Encrypted Secrets',
    description: 'All secrets encrypted at rest and in transit with AES-256-GCM — never exposed to the agent runtime.',
  },
  {
    icon: Globe,
    title: 'Per-Task Egress Allowlists',
    description: 'Network isolation with per-task egress allowlists — zero data exfiltration, by design.',
  },
  {
    icon: Moon,
    title: 'Agent Hibernation',
    description: 'Agents sleep when idle, wake in 200ms — no idle VM costs. 90% lower compute costs vs always-on VMs.',
  },
];

const testimonials = [
  {
    quote:
      'Realtomatic cut our lease abstraction time from 3 weeks to 4 hours. The microVM isolation was the reason our GC signed off.',
    name: 'Mohammed Boukaba',
    role: 'Creator',
    company: 'Realtomatic AI',
    initials: 'MB',
  },
  {
    quote:
      'The valuation engine caught a $4.2M discrepancy in a deal we were about to close. It paid for itself in a single transaction.',
    name: 'Marcus Webb',
    role: 'Managing Director',
    company: 'Atlas Realty Group',
    initials: 'MW',
  },
  {
    quote:
      'We went from 12 properties to 240 without hiring a single analyst. The agents just scale.',
    name: 'Priya Raman',
    role: 'Chief Investment Officer',
    company: 'Northgate Holdings',
    initials: 'PR',
  },
];

const logos = ['MERIDIAN', 'ATLAS', 'NORTHGATE', 'CRESTLINE', 'VANTAGE', 'OAKLINE'];

const agentCards = [
  {
    title: 'Lease Abstraction',
    status: 'Processing page 14…',
    progress: 72,
    icon: FileText,
    className: 'left-[6%] top-[22%]',
    delay: '0s',
  },
  {
    title: 'Valuation Engine',
    status: 'IRR: 18.4% · NPV: +$2.1M',
    progress: 100,
    icon: Calculator,
    className: 'right-[7%] top-[18%]',
    delay: '1.2s',
  },
  {
    title: 'Market Intel',
    status: 'Cap rate shift detected',
    progress: 88,
    icon: TrendingUp,
    className: 'left-[10%] bottom-[24%]',
    delay: '2.1s',
  },
  {
    title: 'Portfolio Opt.',
    status: '3 sell signals generated',
    progress: 64,
    icon: Target,
    className: 'right-[9%] bottom-[28%]',
    delay: '0.6s',
  },
];

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="min-h-screen bg-slate-900 text-white overflow-x-hidden">
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-14px); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-fade-up { animation: fade-up 0.8s ease-out both; }
        .animate-pulse-glow { animation: pulse-glow 4s ease-in-out infinite; }
        .shimmer-line {
          background: linear-gradient(90deg, transparent, rgba(129,140,248,0.4), transparent);
          background-size: 200% 100%;
          animation: shimmer 3s linear infinite;
        }
      `}</style>

      {/* ============ NAV ============ */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-strong">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Zap className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-bold tracking-tight">Realtomatic</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="#customers" className="hover:text-white transition-colors">Customers</a>
          </div>
          <a
            href="#get-access"
            className="text-sm font-medium px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 transition-colors"
          >
            Sign In
          </a>
        </div>
      </nav>

      {/* ============ HERO ============ */}
      <section className="relative min-h-screen flex flex-col justify-center pt-24 pb-16 overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-indigo-950/60 to-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(99,102,241,0.25),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_40%_at_80%_60%,rgba(168,85,247,0.12),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_40%_at_15%_70%,rgba(56,189,248,0.1),transparent)]" />
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.15) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)',
          }}
        />

        {/* Floating agent cards */}
        {agentCards.map((card) => (
          <div
            key={card.title}
            className={`hidden lg:block absolute ${card.className} animate-float z-10`}
            style={{ animationDelay: card.delay }}
          >
            <div className="glass rounded-xl p-4 w-64 shadow-2xl shadow-indigo-950/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/30 border border-indigo-400/20 flex items-center justify-center">
                  <card.icon className="w-4.5 h-4.5 text-indigo-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{card.title}</p>
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-glow" />
                    {card.status}
                  </p>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                  style={{ width: `${card.progress}%` }}
                />
              </div>
            </div>
          </div>
        ))}

        {/* Hero content */}
        <div className="relative z-20 max-w-5xl mx-auto px-6 text-center">
          <div className="animate-fade-up inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-sm text-indigo-300 mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Now in private beta</span>
          </div>
          <div className="animate-fade-up inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-sm text-slate-300 mb-8">
            <span className="text-indigo-300 font-medium">Built by the creator of Pullrun</span>
          </div>

          <h1
            className="animate-fade-up text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6"
            style={{ animationDelay: '0.1s' }}
          >
            AI Agents That
            <br />
            <span className="gradient-text">Run Real Estate</span>
          </h1>

          <p
            className="animate-fade-up max-w-2xl mx-auto text-lg sm:text-xl text-slate-400 leading-relaxed mb-6"
            style={{ animationDelay: '0.2s' }}
          >
            Realtomatic gives property managers an AI operations team: agents that abstract leases,
            answer tenants, size risk, and keep every building moving — while you only handle what
            truly needs a human.
          </p>

          <div
            className="animate-fade-up inline-flex items-center gap-2 px-4 py-2 rounded-xl glass border border-indigo-400/20 text-sm text-slate-300 mb-10"
            style={{ animationDelay: '0.25s' }}
          >
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Zap className="w-3 h-3 text-white" strokeWidth={2.5} />
            </div>
            <span>
              Powered by <span className="font-semibold text-white">Pullrun</span> — Firecracker
              microVM isolation
            </span>
          </div>

          <div
            className="animate-fade-up flex flex-col sm:flex-row items-center justify-center gap-4"
            style={{ animationDelay: '0.3s' }}
          >
            <a
              href="/dashboard"
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 font-semibold text-lg shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Open the live demo
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="#how-it-works"
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl glass font-semibold text-lg hover:bg-white/10 transition-colors"
            >
              <Play className="w-5 h-5 text-indigo-300" />
              See how it works
            </a>
          </div>
        </div>

        {/* Stats bar */}
        <div className="relative z-20 max-w-5xl mx-auto px-6 mt-20">
          <div className="animate-fade-up glass rounded-2xl grid grid-cols-2 md:grid-cols-4 divide-x divide-white/5" style={{ animationDelay: '0.45s' }}>
            {stats.map((stat) => (
              <div key={stat.label} className="px-6 py-6 text-center">
                <p className="text-2xl sm:text-3xl font-bold gradient-text">{stat.value}</p>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Market badges */}
        <div className="relative z-20 flex flex-wrap items-center justify-center gap-3 mt-8">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-sm text-emerald-300">
            <Globe className="w-3.5 h-3.5" />
            US Market Ready
          </span>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-sm text-slate-300">
            <Globe className="w-3.5 h-3.5" />
            EU Expansion 2027
          </span>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section id="features" className="relative py-28">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_0%,rgba(99,102,241,0.08),transparent)]" />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-indigo-400 uppercase tracking-widest mb-3">
              Platform
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              Built for the <span className="gradient-text">modern portfolio</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Every capability, isolated and secure. Agents that work like your best analysts —
              only faster.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative glass rounded-2xl p-8 card-hover hover:border-indigo-400/30 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-950/40"
              >
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.accent} bg-opacity-20 flex items-center justify-center mb-5 opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all`}
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-slate-400 leading-relaxed">{feature.description}</p>
                <div
                  className={`absolute inset-x-8 bottom-0 h-px bg-gradient-to-r ${feature.accent} opacity-0 group-hover:opacity-100 transition-opacity`}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ WHY REALTOMATIC WINS ============ */}
      <section className="relative py-28">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_100%,rgba(99,102,241,0.08),transparent)]" />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-indigo-400 uppercase tracking-widest mb-3">
              Security Moat
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              Why <span className="gradient-text">Realtomatic Wins</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Escape-proof by architecture, not by audit. Pullrun&apos;s security stack is baked into
              every agent task.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {whyWins.map((item) => (
              <div
                key={item.title}
                className="group relative glass rounded-2xl p-8 card-hover hover:border-indigo-400/30 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-950/40"
              >
                <div
                  className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/30 to-violet-500/30 border border-indigo-400/20 flex items-center justify-center mb-5 opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <item.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-slate-400 leading-relaxed">{item.description}</p>
                <div className="absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-indigo-500 to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section id="how-it-works" className="relative py-28">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-950/20 to-transparent" />
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="text-center mb-20">
            <p className="text-sm font-semibold text-indigo-400 uppercase tracking-widest mb-3">
              Workflow
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              Three steps. <span className="gradient-text">Zero spreadsheets.</span>
            </h2>
          </div>

          <div className="relative grid md:grid-cols-3 gap-12 md:gap-8">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-10 left-[18%] right-[18%] h-px">
              <div className="shimmer-line w-full h-full" />
            </div>

            {steps.map((step, i) => (
              <div key={step.title} className="relative text-center group">
                <div className="relative inline-flex mb-6">
                  <div className="w-20 h-20 rounded-2xl glass flex items-center justify-center group-hover:border-indigo-400/40 group-hover:shadow-lg group-hover:shadow-indigo-500/20 transition-all">
                    <step.icon className="w-8 h-8 text-indigo-300" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold flex items-center justify-center shadow-lg shadow-indigo-500/40">
                    {i + 1}
                  </span>
                </div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-slate-400 max-w-xs mx-auto leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS — LEAD INTELLIGENCE ============ */}
      <section id="lead-flow" className="relative py-28">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-rose-950/10 to-transparent" />
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="text-center mb-20">
            <p className="text-sm font-semibold text-rose-400 uppercase tracking-widest mb-3">
              Lead Intelligence
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              Every inquiry, <span className="gradient-text">answered in minutes</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              From first click to booked tour — the Lead Response Agent handles the entire
              front end of your funnel.
            </p>
          </div>

          <div className="relative grid md:grid-cols-4 gap-10 md:gap-6">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-10 left-[12%] right-[12%] h-px">
              <div className="shimmer-line w-full h-full" />
            </div>

            {[
              {
                icon: Mail,
                step: '01',
                title: 'Inquiry comes in',
                description: 'Email, chat, Zillow, or Realtor.com — every channel lands in one inbox.',
              },
              {
                icon: Zap,
                step: '02',
                title: 'AI responds instantly',
                description: 'Pricing, availability, and floor plans delivered in under 2 minutes.',
              },
              {
                icon: CalendarCheck,
                step: '03',
                title: 'AI scores & books',
                description: 'Lead scored 0–100 and the tour booked straight onto the calendar.',
              },
              {
                icon: Bell,
                step: '04',
                title: 'Team gets notified',
                description: 'Full context surfaced to the assigned agent — nothing slips through.',
              },
            ].map((step, i) => (
              <div key={step.title} className="relative text-center group">
                <div className="relative inline-flex mb-6">
                  <div className="w-20 h-20 rounded-2xl glass flex items-center justify-center group-hover:border-rose-400/40 group-hover:shadow-lg group-hover:shadow-rose-500/20 transition-all">
                    <step.icon className="w-8 h-8 text-rose-300" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 text-xs font-bold flex items-center justify-center shadow-lg shadow-rose-500/40">
                    {i + 1}
                  </span>
                </div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-slate-400 max-w-xs mx-auto leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-16 grid sm:grid-cols-3 gap-4">
            {[
              { value: '2min', label: 'Average response time' },
              { value: '94%', label: 'Inquiry response rate' },
              { value: '3.1x', label: 'More tours booked' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="glass rounded-2xl px-6 py-5 text-center card-hover"
              >
                <p className="text-3xl font-bold gradient-text">{stat.value}</p>
                <p className="mt-1 text-sm text-slate-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ SOCIAL PROOF ============ */}
      <section id="customers" className="relative py-28">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-indigo-400 uppercase tracking-widest mb-3">
              Customers
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              Trusted by <span className="gradient-text">top operators</span>
            </h2>
          </div>

          {/* Logos */}
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 mb-20 opacity-50">
            {logos.map((logo) => (
              <div key={logo} className="flex items-center gap-2 text-slate-300">
                <Building2 className="w-5 h-5" />
                <span className="text-lg font-bold tracking-widest">{logo}</span>
              </div>
            ))}
          </div>

          {/* Testimonials */}
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <figure
                key={t.name}
                className="glass rounded-2xl p-8 card-hover hover:border-indigo-400/30 hover:-translate-y-1 transition-all"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-amber-400 fill-current" viewBox="0 0 20 20">
                      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                    </svg>
                  ))}
                </div>
                <blockquote className="text-slate-300 leading-relaxed mb-6">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm font-bold">
                    {t.initials}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{t.name}</p>
                    <p className="text-xs text-slate-400">
                      {t.role} · {t.company}
                    </p>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section id="get-access" className="relative py-28">
        <div className="max-w-4xl mx-auto px-6">
          <div className="relative glass rounded-3xl p-12 sm:p-16 text-center overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_100%,rgba(99,102,241,0.2),transparent)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-400/20 text-indigo-300 text-sm mb-6">
                <Globe className="w-3.5 h-3.5" />
                Limited beta spots available
              </div>
              <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
                Ready to transform
                <br />
                <span className="gradient-text">your portfolio?</span>
              </h2>
              <p className="text-lg text-slate-400 max-w-xl mx-auto mb-10">
                Join 247+ properties already running on Realtomatic. Set up in minutes — no credit card
                required.
              </p>
              <p className="text-sm font-semibold tracking-wide text-indigo-300 mb-6">
                Join the Waitlist
              </p>

              {submitted ? (
                <div className="inline-flex items-center gap-2 px-6 py-4 rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 font-medium">
                  <Check className="w-5 h-5" />
                  You&apos;re on the list — check your inbox.
                </div>
              ) : (
                <form
                  className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (email.trim()) setSubmitted(true);
                  }}
                >
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@fund.com"
                    className="flex-1 px-5 py-4 rounded-xl bg-white/5 border border-white/15 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                  <button
                    type="submit"
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 font-semibold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all whitespace-nowrap"
                  >
                    Get Early Access
                  </button>
                </form>
              )}

              <p className="mt-6 text-sm text-slate-400">
                Or{' '}
                <a href="/dashboard" className="font-medium text-indigo-300 underline-offset-4 hover:text-indigo-200 hover:underline">
                  explore the live platform →
                </a>{' '}
                with real agents already working.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-8 mb-12">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  <Zap className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
                </div>
                <span className="text-lg font-bold tracking-tight">Realtomatic</span>
              </div>
              <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
                The AI agent platform for modern real estate portfolios. Isolated, secure, and
                built to scale.
              </p>
              <p className="text-sm text-slate-500 max-w-xs leading-relaxed mt-3">
                Founded by Mohammed Boukaba | Creator of Pullrun
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold mb-4">Product</p>
              <ul className="space-y-2.5 text-sm text-slate-400">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
                <li><a href="#get-access" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold mb-4">Company</p>
              <ul className="space-y-2.5 text-sm text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold mb-4">Legal</p>
              <ul className="space-y-2.5 text-sm text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-white transition-colors">SOC 2</a></li>
                <li><a href="#" className="hover:text-white transition-colors">GDPR</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-500">
              &copy; {new Date().getFullYear()} Realtomatic, Inc. All rights reserved.
            </p>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Shield className="w-4 h-4" />
              SOC 2 Type II · ISO 27001 · GDPR
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
