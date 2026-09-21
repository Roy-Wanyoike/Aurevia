import type { MarketContext, Signal } from "../types";
import { ACTION, clamp01, toSignal } from "../strategies/base";

// ---------------------------------------------------------------------------
// Aurevia ML Prediction Engine.
//
// Plugs into the SAME MarketContext → Signal contract as the rule-based
// strategies. The Risk Engine and Execution Engine don't know or care
// whether a Signal came from a rule or an ML model.
//
// In this dev environment, we implement a lightweight logistic-regression
// style model that estimates:
//   - probability of positive return over next 5 bars
//   - expected return magnitude
//   - risk probability (volatility-adjusted)
//
// In production, this would be replaced with a trained XGBoost/LightGBM
// model loaded from the model registry. The contract stays identical.
//
// CRITICAL:
//   - No look-ahead bias (only uses candles[0..i])
//   - Model version tracked for reproducibility
//   - Predictions presented as probabilities, NOT certainties
//   - Drift monitoring would compare live prediction distribution to training
// ---------------------------------------------------------------------------

export interface MLPrediction {
  symbol: string;
  modelKey: string;
  modelVersion: string;
  probabilityUp: number; // 0..1 — probability of positive return
  expectedReturn: number; // fractional expected return over horizon
  expectedVolatility: number; // annualized
  riskScore: number; // 0..1 — higher = riskier
  regimeConfidence: number; // 0..1
  features: Record<string, number>; // feature importance snapshot
  timestamp: number;
}

export interface MLModel {
  key: string;
  name: string;
  version: string;
  horizon: string; // "5-bar" | "20-bar" | etc.
  trainedAt: number;
  // The model's predict function. Pure — same inputs always produce same output.
  predict(ctx: MarketContext): MLPrediction | null;
}

// ---------------------------------------------------------------------------
// Aurevia Logistic Momentum Model (ALM v1.0)
//
// A simple logistic-regression style model that estimates probability of
// positive return over the next 5 bars. Uses normalized momentum, RSI,
// MACD histogram, trend strength, and volatility as features.
//
// The coefficients are hand-tuned for the simulated feed. In production,
// these would be learned via walk-forward training on real historical data.
// ---------------------------------------------------------------------------

export const logisticMomentumModel: MLModel = {
  key: "alm-v1",
  name: "Aurevia Logistic Momentum",
  version: "1.0.0",
  horizon: "5-bar",
  trainedAt: Date.now(),

  predict(ctx: MarketContext): MLPrediction | null {
    const { indicators: ind, trend, quote } = ctx;
    if (quote.price <= 0) return null;

    // Normalize features to roughly [0, 1] or [-1, 1]
    const momentumNorm = clamp01((ind.momentum + 0.05) / 0.1); // 10% momentum range
    const rsiNorm = ind.rsi14 / 100;
    const macdNorm = clamp01(0.5 + ind.macdHist / (quote.price * 0.02)); // ±2% of price
    const trendNorm = clamp01(trend.strength);
    // Volatility adjustment — high vol reduces confidence
    const volAdj = clamp01(1 - ind.volatility * 1.5);

    // Logistic combination (hand-tuned weights)
    const weights = {
      momentum: 0.35,
      rsi: 0.15,
      macdHist: 0.25,
      trendStrength: 0.15,
      volAdj: 0.10,
    };

    const z =
      weights.momentum * (momentumNorm - 0.5) * 2 +
      weights.rsi * (rsiNorm - 0.5) * 1.5 +
      weights.macdHist * (macdNorm - 0.5) * 2 +
      weights.trendStrength * (trendNorm - 0.5) * 1.5 +
      weights.volAdj * (volAdj - 0.5) * 1;

    const probabilityUp = clamp01(1 / (1 + Math.exp(-z * 2.5)));

    // Expected return scales with probability and momentum
    const expectedReturn = (probabilityUp - 0.5) * 0.04 * volAdj; // ±2% over 5 bars
    const expectedVolatility = ind.volatility * Math.sqrt(5 / 252); // 5-bar vol
    const riskScore = clamp01(ind.volatility * 1.2 + (1 - volAdj) * 0.3);
    const regimeConfidence = clamp01(trend.strength * 0.5 + Math.abs(ind.adx14 - 25) / 50);

    return {
      symbol: ctx.asset.symbol,
      modelKey: this.key,
      modelVersion: this.version,
      probabilityUp,
      expectedReturn,
      expectedVolatility,
      riskScore,
      regimeConfidence,
      features: {
        momentum: Number(momentumNorm.toFixed(3)),
        rsi: Number(rsiNorm.toFixed(3)),
        macdHist: Number(macdNorm.toFixed(3)),
        trendStrength: Number(trendNorm.toFixed(3)),
        volAdj: Number(volAdj.toFixed(3)),
      },
      timestamp: Date.now(),
    };
  },
};

// ---------------------------------------------------------------------------
// Aurevia Random Forest Classifier (ARF v1.0)
//
// A simulated random-forest style model. Uses an ensemble of weak rules
// (each "tree" votes) to produce a probability. In production, this would
// be a real XGBoost model loaded from the registry.
// ---------------------------------------------------------------------------

export const randomForestModel: MLModel = {
  key: "arf-v1",
  name: "Aurevia Random Forest",
  version: "1.0.0",
  horizon: "20-bar",
  trainedAt: Date.now(),

  predict(ctx: MarketContext): MLPrediction | null {
    const { indicators: ind, trend, regime, quote } = ctx;
    if (quote.price <= 0) return null;

    // Simulate ~7 trees voting
    const votes: number[] = [];
    // Tree 1: trend-aligned
    votes.push(trend.direction === "UP" ? 1 : trend.direction === "DOWN" ? 0 : 0.5);
    // Tree 2: momentum
    votes.push(ind.momentum > 0 ? 1 : 0);
    // Tree 3: RSI regime
    votes.push(ind.rsi14 > 50 && ind.rsi14 < 70 ? 1 : ind.rsi14 < 30 ? 0.7 : 0.3);
    // Tree 4: MACD
    votes.push(ind.macdHist > 0 ? 1 : 0);
    // Tree 5: breakout
    votes.push(trend.breakout ? 1 : trend.breakdown ? 0 : 0.5);
    // Tree 6: regime
    votes.push(regime === "BULL" || regime === "ACCUMULATION" || regime === "BREAKOUT" ? 1 : regime === "BEAR" || regime === "CRASH" ? 0 : 0.5);
    // Tree 7: volatility
    votes.push(ind.volatility < 0.3 ? 0.8 : ind.volatility > 0.5 ? 0.3 : 0.5);

    const probabilityUp = clamp01(votes.reduce((a, b) => a + b, 0) / votes.length);
    const expectedReturn = (probabilityUp - 0.5) * 0.08 * Math.max(0.3, 1 - ind.volatility);
    const expectedVolatility = ind.volatility * Math.sqrt(20 / 252);
    const riskScore = clamp01(ind.volatility + (1 - trend.strength) * 0.2);
    const regimeConfidence = clamp01(trend.strength * 0.6 + Math.abs(ind.adx14 - 20) / 60);

    return {
      symbol: ctx.asset.symbol,
      modelKey: this.key,
      modelVersion: this.version,
      probabilityUp,
      expectedReturn,
      expectedVolatility,
      riskScore,
      regimeConfidence,
      features: {
        trendVote: votes[0],
        momentumVote: votes[1],
        rsiVote: votes[2],
        macdVote: votes[3],
        breakoutVote: votes[4],
        regimeVote: votes[5],
        volVote: votes[6],
      },
      timestamp: Date.now(),
    };
  },
};

export const ML_MODELS: MLModel[] = [logisticMomentumModel, randomForestModel];
export const ML_MODEL_MAP: Record<string, MLModel> = Object.fromEntries(
  ML_MODELS.map((m) => [m.key, m])
);

// Convert an ML prediction into a Signal that flows through the same pipeline.
// Thresholds: probabilityUp > 0.62 → BUY, < 0.38 → SELL, else HOLD.
export function mlPredictionToSignal(pred: MLPrediction): Omit<Signal, "id" | "timestamp"> | null {
  const reasons: string[] = [];
  let action: typeof ACTION[keyof typeof ACTION] = ACTION.HOLD;

  if (pred.probabilityUp > 0.62 && pred.riskScore < 0.6) {
    action = ACTION.BUY;
    reasons.push(`${pred.modelKey}: ${(pred.probabilityUp * 100).toFixed(0)}% probability of positive return`);
    reasons.push(`Expected return ${(pred.expectedReturn * 100).toFixed(2)}% over ${pred.modelKey.includes("alm") ? "5" : "20"} bars`);
    reasons.push(`Risk score ${(pred.riskScore * 100).toFixed(0)}/100 — ${pred.riskScore < 0.3 ? "low" : pred.riskScore < 0.5 ? "moderate" : "elevated"}`);
    return {
      strategyKey: pred.modelKey,
      symbol: pred.symbol,
      action,
      confidence: pred.probabilityUp,
      price: 0, // filled by caller with current quote
      reasons,
    };
  }

  if (pred.probabilityUp < 0.38) {
    action = ACTION.SELL;
    reasons.push(`${pred.modelKey}: only ${(pred.probabilityUp * 100).toFixed(0)}% probability of positive return`);
    reasons.push(`Expected return ${(pred.expectedReturn * 100).toFixed(2)}%`);
    return {
      strategyKey: pred.modelKey,
      symbol: pred.symbol,
      action,
      confidence: 1 - pred.probabilityUp,
      price: 0,
      reasons,
    };
  }

  return null; // HOLD — no signal
}

export { toSignal };
