'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Bot,
  Building2,
  ClipboardCheck,
  FileText,
  Hexagon,
  Inbox,
  KeyRound,
  MessagesSquare,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Search,
  Settings,
  Workflow,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toast';

/**
 * Operator navigation, organised around the property manager's day rather
 * than around analytics: Today -> Properties -> Leasing -> Leases -> Inbox ->
 * Agents -> Workflows -> Approvals -> Assistant. Market intelligence lives
 * inside a property; the pitch deck is reachable by URL only.
 */
const navItems = [
  { href: '/dashboard', label: 'Today', icon: LayoutDashboard },
  { href: '/properties', label: 'Properties', icon: Building2 },
  { href: '/leasing', label: 'Leasing', icon: KeyRound },
  { href: '/leases', label: 'Leases', icon: FileText },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/threads', label: 'Threads', icon: MessagesSquare, threadBadge: true },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/workflows', label: 'Workflows', icon: Workflow },
  { href: '/approvals', label: 'Approvals', icon: ClipboardCheck, liveBadge: true },
  { href: '/chat', label: 'AI Assistant', icon: MessageSquare },
];

const breadcrumbLabels: Record<string, string> = {
  dashboard: 'Today',
  agents: 'Agents',
  properties: 'Properties',
  leasing: 'Leasing',
  leases: 'Leases',
  inbox: 'Inbox',
  threads: 'Threads',
  workflows: 'Workflows',
  approvals: 'Approvals',
  market: 'Market Data',
  settings: 'Settings',
  chat: 'AI Assistant',
  portfolio: 'Portfolio',
  pitch: 'Pitch Deck',
};

function getBreadcrumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  return segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join('/')}`;
    const label = breadcrumbLabels[segment] ?? segment;
    return { href, label };
  });
}

interface AppLayoutProps {
  title: string;
  children: ReactNode;
}

export function AppLayout({ title, children }: AppLayoutProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [awaitingThreads, setAwaitingThreads] = useState(0);
  const breadcrumbs = getBreadcrumbs(pathname);

  // Live approval count so the badge reflects the real queue.
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch('/api/portfolio');
        if (!res.ok) return;
        const body = await res.json();
        const n = body?.summary?.liveStats?.pendingApprovals;
        if (!cancelled && typeof n === 'number') setPendingApprovals(n);
      } catch {
        // keep last
      }
      try {
        const res = await fetch('/api/threads');
        if (!res.ok) return;
        const body = await res.json();
        const n = body?.counts?.awaiting;
        if (!cancelled && typeof n === 'number') setAwaitingThreads(n);
      } catch {
        // keep last
      }
    };
    const first = setTimeout(() => void pull(), 0);
    const t = setInterval(pull, 15_000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {navItems.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== '/dashboard' && pathname.startsWith(item.href));
        const badgeCount = item.liveBadge
          ? pendingApprovals
          : item.threadBadge
            ? awaitingThreads
            : 0;
        const showBadge = badgeCount > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileNavOpen(false)}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-white/10 text-white'
                : 'text-zinc-400 hover:bg-white/5 hover:text-white'
            )}
          >
            <item.icon
              className={cn(
                'h-4 w-4 shrink-0',
                active ? 'text-indigo-400' : 'text-zinc-500 group-hover:text-zinc-300'
              )}
            />
            {item.label}
            {showBadge && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-xs font-semibold text-amber-400">
                {badgeCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center gap-2.5 border-b border-white/15 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
          <Hexagon className="h-4 w-4 text-white" fill="currentColor" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight text-white">Realtomatic</span>
          </div>
          <span className="block text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            AI Platform
          </span>
        </div>
      </div>
      {nav}
      <div className="border-t border-white/15 p-3">
        <Link
          href="/settings"
          onClick={() => setMobileNavOpen(false)}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Settings className="h-4 w-4 text-zinc-500" />
          Settings
        </Link>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-900">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-zinc-900 lg:flex">
        {sidebarContent}
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-zinc-900 shadow-2xl">
            <button
              onClick={() => setMobileNavOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/15 bg-slate-900/80 px-4 backdrop-blur-md sm:px-6">
          <button
            className="rounded-md p-2 text-zinc-400 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <nav aria-label="Breadcrumb" className="hidden sm:block">
            <ol className="flex items-center gap-1.5 text-sm">
              {breadcrumbs.map((crumb, index) => (
                <li key={crumb.href} className="flex items-center gap-1.5">
                  {index > 0 && (
                    <span className="text-zinc-600">/</span>
                  )}
                  <Link
                    href={crumb.href}
                    className={cn(
                      'transition-colors',
                      index === breadcrumbs.length - 1
                        ? 'font-medium text-zinc-200'
                        : 'text-zinc-500 hover:text-zinc-300'
                    )}
                  >
                    {crumb.label}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
          <h1 className="text-lg font-semibold tracking-tight text-white sm:hidden">
            {title}
          </h1>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search..."
                className="h-9 w-56 rounded-lg border border-white/15 bg-white/5 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <button
              className="relative rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-slate-950" />
            </button>
            <div className="flex items-center gap-2.5 border-l border-white/15 pl-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
                MB
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-tight text-zinc-200">Mohammed Boukaba</p>
                <p className="text-xs leading-tight text-zinc-500">Creator</p>
              </div>
            </div>
          </div>
        </header>
        <main className="relative flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage:
                'radial-gradient(ellipse 80% 50% at 50% -20%, rgb(99 102 241 / 0.15), transparent)',
            }}
          />
          <div className="relative h-full">{children}</div>
        </main>
        <Toaster />
        <footer className="border-t border-white/15 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-2 text-xs text-zinc-600 sm:flex-row">
            <p>Realtomatic v0.1.0 — AI Agent Platform for Real Estate</p>
            <div className="flex items-center gap-4">
              <Link href="/settings" className="transition-colors hover:text-zinc-400">
                Settings
              </Link>
              <Link href="/dashboard" className="transition-colors hover:text-zinc-400">
                Dashboard
              </Link>
              <span className="text-zinc-700">© 2026 Realtomatic</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default AppLayout;
