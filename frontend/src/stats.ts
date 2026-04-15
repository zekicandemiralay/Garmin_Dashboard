/** Rolling mean over a window. Requires at least half the window to be non-null. */
export function rollingMean(vals: (number | null)[], window: number): (number | null)[] {
  return vals.map((_, i) => {
    const slice = vals.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null)
    return slice.length >= Math.ceil(window / 2) ? slice.reduce((a, b) => a + b, 0) / slice.length : null
  })
}

/** Rolling population std dev. Returns null where mean is null. */
export function rollingStd(vals: (number | null)[], window: number, means: (number | null)[]): (number | null)[] {
  return vals.map((_, i) => {
    const mean = means[i]
    if (mean == null) return null
    const slice = vals.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null)
    if (slice.length < Math.ceil(window / 2)) return null
    return Math.sqrt(slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / slice.length)
  })
}

/** Cumulative sum, treating nulls as 0. */
export function cumulativeSum(vals: number[]): number[] {
  let acc = 0
  return vals.map(v => (acc += v))
}

/** Simple linear regression. Returns { slope, intercept, r2 }. */
export function linearRegression(xs: number[], ys: (number | null)[]): { slope: number; intercept: number; r2: number } {
  const pairs = xs.map((x, i) => [x, ys[i]] as [number, number | null]).filter((p): p is [number, number] => p[1] != null)
  const n = pairs.length
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 }
  const meanX = pairs.reduce((a, [x]) => a + x, 0) / n
  const meanY = pairs.reduce((a, [, y]) => a + y, 0) / n
  const ssXX = pairs.reduce((a, [x]) => a + (x - meanX) ** 2, 0)
  const ssXY = pairs.reduce((a, [x, y]) => a + (x - meanX) * (y - meanY), 0)
  const ssYY = pairs.reduce((a, [, y]) => a + (y - meanY) ** 2, 0)
  const slope = ssXX === 0 ? 0 : ssXY / ssXX
  const intercept = meanY - slope * meanX
  const r2 = ssYY === 0 ? 0 : (ssXY ** 2) / (ssXX * ssYY)
  return { slope, intercept, r2 }
}
