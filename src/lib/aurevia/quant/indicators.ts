import type { Candle, Indicators } from "../types";

// ---------------------------------------------------------------------------
// Aurevia Quant Engine — technical indicators.
// Every function here is pure and operates on a closed candle series. Each
// indicator at index i uses ONLY candles[0..i], so there is no look-ahead
// bias. Backtests and live evaluation share the exact same math.
// ---------------------------------------------------------------------------

export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (period <= 0 || values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  // Shift so EMA(period) is only valid after `period` bars.
  for (let i = 0; i < Math.min(period - 1, values.length); i++) out[i] = NaN;
  return out;
}

export function rsi(values: number[], period: number = 14): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const ch = values[i] - values[i - 1];
    if (ch >= 0) gains += ch;
    else losses -= ch;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) =>
    isNaN(emaFast[i]) || isNaN(emaSlow[i]) ? NaN : emaFast[i] - emaSlow[i]
  );
  // signal line = EMA of macdLine (only the non-NaN tail)
  const firstValid = macdLine.findIndex((v) => !isNaN(v));
  const signalLine: number[] = new Array(values.length).fill(NaN);
  if (firstValid >= 0) {
    const tail = macdLine.slice(firstValid);
    const sigTail = ema(tail, signal);
    for (let i = 0; i < sigTail.length; i++) signalLine[firstValid + i] = sigTail[i];
  }
  const hist = values.map((_, i) =>
    isNaN(macdLine[i]) || isNaN(signalLine[i]) ? NaN : macdLine[i] - signalLine[i]
  );
  return { macdLine, signalLine, hist };
}

export function bollingerBands(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: number[] = new Array(values.length).fill(NaN);
  const lower: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += (values[j] - mid[i]) ** 2;
    const sd = Math.sqrt(sum / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { upper, mid, lower };
}

export function atr(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trs.push(candles[i].high - candles[i].low);
    } else {
      const prevClose = candles[i - 1].close;
      trs.push(
        Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - prevClose),
          Math.abs(candles[i].low - prevClose)
        )
      );
    }
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trs[i];
  out[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + trs[i]) / period;
  }
  return out;
}

// Wilder's ADX. Standard 14-period. Returns {adx, plusDM, minusDM}.
export function adx(candles: Candle[], period = 14) {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length <= period * 2) return { adx: out };
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      )
    );
  }
  // Smooth Wilder-style
  let trS = 0;
  let plusS = 0;
  let minusS = 0;
  for (let i = 1; i <= period; i++) {
    trS += tr[i];
    plusS += plusDM[i];
    minusS += minusDM[i];
  }
  const dx: number[] = new Array(candles.length).fill(NaN);
  let plusDI = trS === 0 ? 0 : (plusS / trS) * 100;
  let minusDI = trS === 0 ? 0 : (minusS / trS) * 100;
  let adxVal = 0;
  dx[period] = plusDI + minusDI === 0 ? 0 : (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;
  for (let i = period + 1; i < candles.length; i++) {
    trS = trS - trS / period + tr[i];
    plusS = plusS - plusS / period + plusDM[i];
    minusS = minusS - minusS / period + minusDM[i];
    plusDI = trS === 0 ? 0 : (plusS / trS) * 100;
    minusDI = trS === 0 ? 0 : (minusS / trS) * 100;
    dx[i] = plusDI + minusDI === 0 ? 0 : (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;
  }
  // ADX = smoothed DX
  let dxSum = 0;
  let counted = 0;
  for (let i = period; i < candles.length && counted < period; i++) {
    if (!isNaN(dx[i])) {
      dxSum += dx[i];
      counted++;
    }
  }
  if (counted === period) {
    adxVal = dxSum / period;
    let idx = period * 2 - 1;
    out[Math.min(idx, candles.length - 1)] = adxVal;
    for (let i = period * 2; i < candles.length; i++) {
      if (isNaN(dx[i])) continue;
      adxVal = (adxVal * (period - 1) + dx[i]) / period;
      out[i] = adxVal;
    }
  }
  return { adx: out };
}

export function stochastic(candles: Candle[], period = 14, smoothK = 3) {
  const kRaw: number[] = new Array(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j].high);
      ll = Math.min(ll, candles[j].low);
    }
    kRaw[i] = hh === ll ? 50 : ((candles[i].close - ll) / (hh - ll)) * 100;
  }
  // Smooth %K and derive %D
  const kSmoothed = sma(kRaw.map((v) => (isNaN(v) ? 0 : v)), smoothK);
  for (let i = 0; i < smoothK - 1; i++) kSmoothed[i] = NaN;
  const d = sma(kRaw.map((v) => (isNaN(v) ? 0 : v)), smoothK * 2);
  return { k: kSmoothed, d };
}

export function vwap(candles: Candle[]): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumPV += tp * candles[i].volume;
    cumV += candles[i].volume;
    out[i] = cumV === 0 ? tp : cumPV / cumV;
  }
  return out;
}

export function obv(candles: Candle[]): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  if (candles.length === 0) return out;
  out[0] = 0;
  for (let i = 1; i < candles.length; i++) {
    const sign = Math.sign(candles[i].close - candles[i - 1].close);
    out[i] = out[i - 1] + sign * candles[i].volume;
  }
  return out;
}

export function roc(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    out[i] = values[i - period] === 0 ? 0 : ((values[i] - values[i - period]) / values[i - period]) * 100;
  }
  return out;
}

// Compute the full indicator snapshot at the latest bar of `candles`.
export function computeIndicators(candles: Candle[]): Indicators {
  const closes = candles.map((c) => c.close);
  const sma20Arr = sma(closes, 20);
  const sma50Arr = sma(closes, 50);
  const sma200Arr = sma(closes, 200);
  const ema12Arr = ema(closes, 12);
  const ema26Arr = ema(closes, 26);
  const rsiArr = rsi(closes, 14);
  const { macdLine, signalLine, hist } = macd(closes);
  const bb = bollingerBands(closes, 20, 2);
  const atrArr = atr(candles, 14);
  const { adx: adxArr } = adx(candles, 14);
  const { k: stochK, d: stochD } = stochastic(candles, 14, 3);
  const vwapArr = vwap(candles);
  const obvArr = obv(candles);
  const rocArr = roc(closes, 12);

  const last = closes.length - 1;
  // Volatility = annualized std of log returns over last 20 bars (scaled by sqrt(252)).
  const window = closes.slice(Math.max(0, last - 20), last + 1);
  const rets: number[] = [];
  for (let i = 1; i < window.length; i++) rets.push(Math.log(window[i] / window[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length);
  const volatility = Math.sqrt(variance) * Math.sqrt(252);
  const momentum = closes[last] / closes[Math.max(0, last - 10)] - 1;

  return {
    sma20: lastVal(sma20Arr, last),
    sma50: lastVal(sma50Arr, last),
    sma200: lastVal(sma200Arr, last),
    ema12: lastVal(ema12Arr, last),
    ema26: lastVal(ema26Arr, last),
    rsi14: lastVal(rsiArr, last),
    macd: lastVal(macdLine, last),
    macdSignal: lastVal(signalLine, last),
    macdHist: lastVal(hist, last),
    bollingerUpper: lastVal(bb.upper, last),
    bollingerMiddle: lastVal(bb.mid, last),
    bollingerLower: lastVal(bb.lower, last),
    atr14: lastVal(atrArr, last),
    adx14: lastVal(adxArr, last),
    stochasticK: lastVal(stochK, last),
    stochasticD: lastVal(stochD, last),
    vwap: lastVal(vwapArr, last),
    obv: lastVal(obvArr, last),
    roc: lastVal(rocArr, last),
    volatility,
    momentum,
  };
}

function lastVal(arr: number[], i: number): number {
  for (let j = i; j >= 0; j--) {
    if (!isNaN(arr[j])) return arr[j];
  }
  return 0;
}

// Return the full series of a named indicator (used for chart overlays).
export function indicatorSeries(candles: Candle[], name: string): number[] {
  const closes = candles.map((c) => c.close);
  switch (name) {
    case "sma20":
      return sma(closes, 20);
    case "sma50":
      return sma(closes, 50);
    case "sma200":
      return sma(closes, 200);
    case "ema12":
      return ema(closes, 12);
    case "ema26":
      return ema(closes, 26);
    case "rsi14":
      return rsi(closes, 14);
    case "vwap":
      return vwap(candles);
    case "bollingerUpper": {
      const bb = bollingerBands(closes, 20, 2);
      return bb.upper;
    }
    case "bollingerLower": {
      const bb = bollingerBands(closes, 20, 2);
      return bb.lower;
    }
    default:
      return [];
  }
}
