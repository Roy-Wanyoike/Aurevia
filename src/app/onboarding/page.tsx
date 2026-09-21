"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  FlaskConical,
  Lock,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Activity,
  Zap,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia first-run onboarding flow (Issue #121).
//
// Five-step wizard rendered as a single client component:
//   0. Welcome          — branded hero
//   1. Trading mode     — PAPER (default) / SANDBOX (coming soon) / LIVE (gated)
//   2. Watchlist        — checkbox grid of the 18-asset universe (loaded from
//                         /api/v1/markets)
//   3. Risk profile     — Conservative / Moderate / Aggressive radio cards
//   4. Done              — summary + "Enter Aurevia" → /?view=dashboard
//
// Selections persist to localStorage on every step transition so a refresh
// mid-flow doesn't lose progress. The final step sets `aurevia:onboarded=true`
// before redirecting; src/app/page.tsx reads that flag in its mount effect
// and bounces any un-onboarded visitor arriving on `/?view=dashboard` back
// here.
//
// No backend writes — the wizard is purely a UX affordance. Risk profile +
// watchlist seed the local UI state; wiring them into the org-scoped user
// preferences API is a follow-up.
// ---------------------------------------------------------------------------

type TradingMode = "PAPER" | "SANDBOX" | "LIVE";
type RiskProfile = "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";

interface MarketAsset {
  symbol: string;
  name: string;
  exchange: string;
  assetType: string;
  sector?: string;
}

interface OnboardingState {
  tradingMode: TradingMode;
  watchlist: string[];
  riskProfile: RiskProfile;
}

const STORAGE_KEY = "aurevia:onboarding";
const ONBOARDED_KEY = "aurevia:onboarded";

const TOTAL_STEPS = 5; // 0..4 inclusive

const TRADING_MODES: {
  value: TradingMode;
  title: string;
  description: string;
  badge?: string;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  recommended?: boolean;
}[] = [
  {
    value: "PAPER",
    title: "Paper Trading",
    description: "Simulated orders against live market data. Risk-free — start here.",
    badge: "RECOMMENDED",
    icon: FlaskConical,
    recommended: true,
  },
  {
    value: "SANDBOX",
    title: "Sandbox",
    description: "Broker sandbox environment with simulated fills.",
    badge: "COMING SOON",
    disabled: true,
    icon: Sparkles,
  },
  {
    value: "LIVE",
    title: "Live",
    description: "Real capital, real broker. Requires approval + signed risk acknowledgment.",
    badge: "REQUIRES APPROVAL",
    disabled: true,
    icon: Lock,
  },
];

const RISK_PROFILES: {
  value: RiskProfile;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    value: "CONSERVATIVE",
    title: "Conservative",
    description: "Tight stop-losses, low per-position exposure, capital preservation first.",
    icon: ShieldCheck,
  },
  {
    value: "MODERATE",
    title: "Moderate",
    description: "Balanced risk/reward — diversified book, mid leverage, default profile.",
    icon: TrendingUp,
  },
  {
    value: "AGGRESSIVE",
    title: "Aggressive",
    description: "Higher concentration, wider risk bands, larger position sizing.",
    icon: Zap,
  },
];

function loadState(): OnboardingState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OnboardingState;
  } catch {
    return null;
  }
}

function saveState(s: OnboardingState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore quota / private mode
  }
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [markets, setMarkets] = useState<MarketAsset[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [state, setState] = useState<OnboardingState>({
    tradingMode: "PAPER",
    watchlist: [],
    riskProfile: "MODERATE",
  });

  // Restore in-flight onboarding state on mount so a refresh mid-flow
  // doesn't reset the wizard.
  useEffect(() => {
    const saved = loadState();
    if (saved) {
      setState(saved);
      // If they had reached the final step but didn't click "Enter", resume.
      // We don't auto-advance past step 4 because that's the CTA screen.
      if (saved.riskProfile && saved.watchlist.length > 0) {
        setStep(4);
      } else if (saved.tradingMode && saved.watchlist.length >= 0) {
        // Functional update so we don't need `step` in the dep array —
        // the effect intentionally runs once on mount only.
        setStep((s) => Math.max(s, saved.watchlist.length > 0 ? 3 : 1));
      }
    }
  }, []);

  // Fetch the tradeable universe once we land on the watchlist step (lazy).
  useEffect(() => {
    if (step < 2 || markets.length > 0) return;
    setMarketsLoading(true);
    fetch("/api/v1/markets")
      .then((r) => r.json())
      .then((data: { assets: MarketAsset[] }) => {
        setMarkets(data.assets ?? []);
        // Default-select the first 6 tickers so the user has a starting set.
        setState((s) => ({
          ...s,
          watchlist: s.watchlist.length > 0 ? s.watchlist : data.assets.slice(0, 6).map((a) => a.symbol),
        }));
      })
      .catch(() => {
        toast.error("Failed to load market universe");
      })
      .finally(() => setMarketsLoading(false));
  }, [step, markets.length]);

  function next() {
    if (step >= TOTAL_STEPS - 1) return;
    const nextStep = step + 1;
    saveState(state);
    setStep(nextStep);
  }

  function back() {
    if (step <= 0) return;
    setStep(step - 1);
  }

  function toggleWatchlist(symbol: string) {
    setState((s) => {
      const has = s.watchlist.includes(symbol);
      const watchlist = has
        ? s.watchlist.filter((w) => w !== symbol)
        : [...s.watchlist, symbol];
      const next = { ...s, watchlist };
      saveState(next);
      return next;
    });
  }

  function finish() {
    try {
      window.localStorage.setItem(ONBOARDED_KEY, "true");
    } catch {
      // private mode — still redirect, the dashboard will re-trigger onboarding
    }
    toast.success("Welcome to Aurevia");
    // Hard navigation so the layout fully re-mounts with the dashboard.
    window.location.href = "/?view=dashboard";
  }

  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 sm:px-6 sm:py-12">
        {/* Brand + progress */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image
              src="/branding/aurevia-logo.svg"
              alt="Aurevia logo"
              width={32}
              height={32}
              priority
              className="h-8 w-8"
            />
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight">Aurevia</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Onboarding
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono tabular">
              {step + 1}/{TOTAL_STEPS}
            </span>
            <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-muted sm:block">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
                aria-hidden
              />
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col">
          {step === 0 && <WelcomeStep />}
          {step === 1 && (
            <TradingModeStep
              value={state.tradingMode}
              onChange={(m) => setState((s) => ({ ...s, tradingMode: m }))}
            />
          )}
          {step === 2 && (
            <WatchlistStep
              markets={markets}
              loading={marketsLoading}
              selected={state.watchlist}
              onToggle={toggleWatchlist}
            />
          )}
          {step === 3 && (
            <RiskProfileStep
              value={state.riskProfile}
              onChange={(r) => setState((s) => ({ ...s, riskProfile: r }))}
            />
          )}
          {step === 4 && <SummaryStep state={state} markets={markets} />}
        </main>

        {/* Sticky footer nav */}
        <footer className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={back}
            disabled={step === 0}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          {step < TOTAL_STEPS - 1 ? (
            <Button size="sm" onClick={next} className="gap-1.5">
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={finish} className="gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Enter Aurevia
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 0 — Welcome
// ---------------------------------------------------------------------------

function WelcomeStep() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <Image
        src="/branding/aurevia-logo.svg"
        alt="Aurevia logo"
        width={72}
        height={72}
        priority
        className="mb-6 h-16 w-16 sm:h-18 sm:w-18"
      />
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Aurevia
      </h1>
      <p className="mt-2 max-w-md text-base text-muted-foreground sm:text-lg">
        Intelligence for moving markets.
      </p>
      <p className="mt-4 max-w-lg text-sm text-muted-foreground">
        A 30-second setup picks your trading mode, seeds a watchlist, and tunes
        your risk profile so the dashboard lands on the right defaults.
      </p>
      <div className="mt-8 grid w-full max-w-md grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground sm:gap-3">
        <div className="rounded-md border border-border bg-muted/30 p-2.5">
          <Activity className="mx-auto mb-1 h-4 w-4 text-primary" />
          18 assets
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-2.5">
          <ShieldCheck className="mx-auto mb-1 h-4 w-4 text-primary" />
          Risk-engine
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-2.5">
          <TrendingUp className="mx-auto mb-1 h-4 w-4 text-primary" />
          Backtests
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Trading mode
// ---------------------------------------------------------------------------

function TradingModeStep({
  value,
  onChange,
}: {
  value: TradingMode;
  onChange: (m: TradingMode) => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Choose your trading mode</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You can switch modes later from the Settings view.
        </p>
      </header>
      <div className="grid gap-3">
        {TRADING_MODES.map((mode) => {
          const Icon = mode.icon;
          const active = value === mode.value;
          return (
            <button
              key={mode.value}
              type="button"
              disabled={mode.disabled}
              onClick={() => !mode.disabled && onChange(mode.value)}
              aria-pressed={active}
              className={cn(
                "group flex w-full items-start gap-4 rounded-lg border p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-primary/40 hover:bg-muted/30",
                mode.disabled && "cursor-not-allowed opacity-60 hover:border-border hover:bg-transparent",
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{mode.title}</span>
                  {mode.badge && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-mono tracking-wider",
                        mode.recommended
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                          : mode.disabled
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                            : "",
                      )}
                    >
                      {mode.badge}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{mode.description}</p>
              </div>
              <div
                className={cn(
                  "mt-1 h-4 w-4 shrink-0 rounded-full border-2",
                  active ? "border-primary bg-primary" : "border-muted-foreground/40",
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Watchlist
// ---------------------------------------------------------------------------

function WatchlistStep({
  markets,
  loading,
  selected,
  onToggle,
}: {
  markets: MarketAsset[];
  loading: boolean;
  selected: string[];
  onToggle: (symbol: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Pick assets to watch</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Selected <span className="font-medium text-foreground">{selected.length}</span> of{" "}
          <span className="font-medium text-foreground">{markets.length || 18}</span> assets.
          You can refine this later from the Watchlists view.
        </p>
      </header>
      {loading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {markets.map((asset) => {
            const checked = selected.includes(asset.symbol);
            return (
              <label
                key={asset.symbol}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-all hover:bg-muted/30",
                  checked ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggle(asset.symbol)}
                  aria-label={`Watch ${asset.symbol}`}
                />
                <div className="flex flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{asset.symbol}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {asset.exchange}
                    </span>
                  </div>
                  <span className="truncate text-xs text-muted-foreground">{asset.name}</span>
                </div>
                {asset.sector && (
                  <Badge variant="outline" className="text-[10px]">
                    {asset.sector}
                  </Badge>
                )}
              </label>
            );
          })}
        </div>
      )}
      {selected.length === 0 && !loading && (
        <p className="mt-3 text-xs text-muted-foreground">
          Tip: pick at least one asset so the dashboard has data to render.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Risk profile
// ---------------------------------------------------------------------------

function RiskProfileStep({
  value,
  onChange,
}: {
  value: RiskProfile;
  onChange: (r: RiskProfile) => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Risk profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sets default per-position exposure, stop-loss bands, and circuit-breaker thresholds.
        </p>
      </header>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as RiskProfile)}
        className="grid gap-3"
      >
        {RISK_PROFILES.map((profile) => {
          const Icon = profile.icon;
          const active = value === profile.value;
          return (
            <Label
              key={profile.value}
              htmlFor={`risk-${profile.value}`}
              className={cn(
                "flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-all",
                active
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-primary/40 hover:bg-muted/30",
              )}
            >
              <RadioGroupItem
                value={profile.value}
                id={`risk-${profile.value}`}
                className="mt-1"
              />
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                  <span className="text-base font-semibold">{profile.title}</span>
                </div>
                <p className="text-sm text-muted-foreground">{profile.description}</p>
              </div>
            </Label>
          );
        })}
      </RadioGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Summary
// ---------------------------------------------------------------------------

function SummaryStep({
  state,
  markets,
}: {
  state: OnboardingState;
  markets: MarketAsset[];
}) {
  const selectedMarkets = markets.filter((m) => state.watchlist.includes(m.symbol));
  const mode = TRADING_MODES.find((m) => m.value === state.tradingMode);
  const risk = RISK_PROFILES.find((r) => r.value === state.riskProfile);
  return (
    <div className="flex flex-1 flex-col">
      <header className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">You&apos;re ready!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s your setup. Click <span className="font-medium text-foreground">Enter Aurevia</span> to land on the dashboard.
        </p>
      </header>
      <Card className="p-5">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Trading mode
            </dt>
            <dd className="mt-1 text-sm font-medium">{mode?.title ?? state.tradingMode}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Risk profile
            </dt>
            <dd className="mt-1 text-sm font-medium">{risk?.title ?? state.riskProfile}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Watchlist ({selectedMarkets.length} assets)
            </dt>
            <dd className="mt-2 flex flex-wrap gap-1.5">
              {selectedMarkets.length === 0 ? (
                <span className="text-xs text-muted-foreground">No assets selected</span>
              ) : (
                selectedMarkets.map((m) => (
                  <Badge key={m.symbol} variant="outline" className="font-mono text-xs">
                    {m.symbol}
                  </Badge>
                ))
              )}
            </dd>
          </div>
        </dl>
      </Card>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Selections are stored locally in your browser.
      </p>
    </div>
  );
}
