import { NextResponse } from "next/server";
import { store } from "@/lib/aurevia/store";
import { requireAuth } from "@/lib/aurevia/auth/check";
import { logger } from "@/lib/aurevia/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Aurevia — Data export (Issue #124).
//
// GET /api/v1/export?type=orders|backtests|signals|portfolio&format=csv|json
//
// Returns either:
//   - `format=json` (default) → JSON response with the same shape as the
//     list endpoints, suitable for piping into `jq` or another tool.
//   - `format=csv`            → `text/csv` response with `Content-Disposition:
//     attachment; filename="<type>-<timestamp>.csv"` so the browser offers to
//     save the file rather than render it inline.
//
// Source data is the in-memory singleton store — orders, backtests, signals
// are already in memory; portfolio is computed via `store.getPortfolio()`.
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set(["orders", "backtests", "signals", "portfolio"]);
const VALID_FORMATS = new Set(["csv", "json"]);

// CSV fields per type. Keep the field set small and flat — nested objects are
// JSON-stringified into a single cell so a spreadsheet tool can ingest the
// row without expanding columns.
const CSV_FIELDS: Record<string, string[]> = {
  orders: [
    "id", "symbol", "side", "quantity", "orderType", "limitPrice",
    "status", "filledPrice", "filledQty", "strategyKey", "reason",
    "createdAt", "updatedAt",
  ],
  backtests: [
    "id", "strategyKey", "symbol", "timeframe", "startDate", "endDate",
    "initialCapital", "finalEquity", "totalReturn", "annualReturn",
    "sharpe", "sortino", "maxDrawdown", "winRate", "trades", "exposure",
    "status", "createdAt",
  ],
  signals: [
    "id", "strategyKey", "symbol", "action", "confidence", "price",
    "reasons", "timestamp", "status", "riskReason",
  ],
  portfolio: [
    "symbol", "side", "quantity", "avgPrice", "lastPrice", "marketValue",
    "unrealizedPnl", "pnlPct", "exposurePct",
  ],
};

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  // RFC 4180: wrap in quotes if the value contains a comma, quote, newline,
  // or leading/trailing whitespace. Escape embedded quotes by doubling them.
  if (/[",\n\r]/.test(str) || str !== str.trim()) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows: Record<string, unknown>[], fields: string[]): string {
  const header = fields.join(",");
  const body = rows
    .map((row) => fields.map((f) => escapeCsv(row[f])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

function flattenOrder(o: any): Record<string, unknown> {
  return {
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    quantity: o.quantity,
    orderType: o.orderType,
    limitPrice: o.limitPrice ?? "",
    status: o.status,
    filledPrice: o.filledPrice ?? "",
    filledQty: o.filledQty ?? "",
    strategyKey: o.strategyKey ?? "",
    reason: o.reason ?? "",
    createdAt: o.createdAt,
    updatedAt: o.updatedAt ?? "",
  };
}

function flattenBacktest(b: any): Record<string, unknown> {
  return {
    id: b.id,
    strategyKey: b.strategyKey,
    symbol: b.symbol,
    timeframe: b.timeframe,
    startDate: b.startDate,
    endDate: b.endDate,
    initialCapital: b.initialCapital,
    finalEquity: b.finalEquity ?? "",
    totalReturn: b.metrics?.totalReturn ?? b.totalReturn ?? "",
    annualReturn: b.metrics?.annualReturn ?? b.annualReturn ?? "",
    sharpe: b.metrics?.sharpe ?? b.sharpe ?? "",
    sortino: b.metrics?.sortino ?? b.sortino ?? "",
    maxDrawdown: b.metrics?.maxDrawdown ?? b.maxDrawdown ?? "",
    winRate: b.metrics?.winRate ?? b.winRate ?? "",
    trades: b.trades?.length ?? b.trades ?? "",
    exposure: b.metrics?.exposure ?? b.exposure ?? "",
    status: b.status,
    createdAt: b.createdAt,
  };
}

function flattenSignal(s: any): Record<string, unknown> {
  return {
    id: s.id,
    strategyKey: s.strategyKey,
    symbol: s.symbol,
    action: s.action,
    confidence: s.confidence,
    price: s.price,
    reasons: s.reasons,
    timestamp: s.timestamp,
    status: s.status,
    riskReason: s.riskReason ?? "",
  };
}

function flattenPosition(p: any): Record<string, unknown> {
  const qty = p.quantity ?? 0;
  const lastPrice = p.marketPrice ?? 0;
  const avgPrice = p.avgEntryPrice ?? 0;
  const marketValue = qty * lastPrice;
  const unrealizedPnl = marketValue - qty * avgPrice;
  const pnlPct = avgPrice ? (unrealizedPnl / (qty * avgPrice)) * 100 : 0;
  return {
    symbol: p.symbol,
    side: p.side,
    quantity: qty,
    avgPrice,
    lastPrice,
    marketValue,
    unrealizedPnl,
    pnlPct,
    exposurePct: p.unrealizedPnlPct ?? "",
  };
}

function getData(type: string): Record<string, unknown>[] {
  switch (type) {
    case "orders":
      return store.orders.map(flattenOrder);
    case "backtests":
      return store.backtests.map(flattenBacktest);
    case "signals":
      return store.signals.map(flattenSignal);
    case "portfolio": {
      const portfolio = store.getPortfolio();
      return (portfolio.positions ?? []).map(flattenPosition);
    }
    default:
      return [];
  }
}

function jsonPayload(type: string): Record<string, unknown> {
  switch (type) {
    case "orders":
      return { orders: store.orders, total: store.orders.length };
    case "backtests":
      return { backtests: store.backtests, total: store.backtests.length };
    case "signals":
      return { signals: store.signals, total: store.signals.length };
    case "portfolio": {
      const portfolio = store.getPortfolio();
      return { portfolio, positions: portfolio.positions ?? [] };
    }
    default:
      return {};
  }
}

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? "";
    const format = (url.searchParams.get("format") ?? "json").toLowerCase();

    if (!VALID_TYPES.has(type)) {
      return NextResponse.json(
        {
          error: `Invalid or missing 'type' param. Must be one of: ${Array.from(VALID_TYPES).join(", ")}.`,
        },
        { status: 400 },
      );
    }
    if (!VALID_FORMATS.has(format)) {
      return NextResponse.json(
        {
          error: `Invalid 'format' param. Must be one of: ${Array.from(VALID_FORMATS).join(", ")}.`,
        },
        { status: 400 },
      );
    }

    if (format === "csv") {
      const rows = getData(type);
      const fields = CSV_FIELDS[type];
      const csv = toCsv(rows, fields);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `aurevia-${type}-${stamp}.csv`;
      logger.debug("CSV export", { requestId, type, rows: rows.length, filename });
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // JSON — same shape as the list endpoints, so callers can swap them.
    const payload = jsonPayload(type);
    logger.debug("JSON export", { requestId, type });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    logger.error("Export GET failed", { requestId, error: e?.message ?? "unknown" });
    return NextResponse.json({ error: "internal_error", requestId }, { status: 500 });
  }
}
