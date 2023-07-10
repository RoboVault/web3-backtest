interface EGARCHParams {
  startPrice: number;
  testDuration: number; // in days
  interval: number; // in seconds
  initialVariance: number;
  alpha: number;
  gamma: number;
  beta: number;
  drift: number;
}

interface GBMParams {
  startPrice: number;
  testDuration: number; // in days
  interval: number; // in seconds
  variance: number;
  drift: number;
}

const randn_bm = () => {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random(); //Converting [0,1) to (0,1)
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

export function generateGbm({
  startPrice,
  testDuration,
  interval,
  variance,
  drift,
}: GBMParams): number[] {
  const totalDurationInSeconds = testDuration * 24 * 60 * 60;
  const numberOfIntervals = Math.floor(totalDurationInSeconds / interval);
  const timeStep = interval / (365 * 24 * 60 * 60); // converting interval from seconds to years

  const mu = drift;
  const sigma = variance;
  const dt = timeStep;
  const S0 = startPrice;
  const N = numberOfIntervals;

  // Implement GBM
  const S = [S0];
  for (let i = 1; i < N; i++) {
    const t = dt * i;
    const W = Math.sqrt(dt) * randn_bm();
    const St =
      S[S.length - 1] * Math.exp((mu - sigma ** 2 / 2) * t + sigma * W);
    S.push(St);
  }
  return S;
}

export function generateGbmEgarch({
  startPrice,
  testDuration,
  interval,
  initialVariance,
  alpha,
  gamma,
  beta,
  drift,
}: EGARCHParams): number[] {
  let logVariances: number[] = [
    Math.log(initialVariance),
    Math.log(initialVariance),
  ]; // same for logVariances
  let totalDurationInSeconds = testDuration * 24 * 60 * 60;
  let numberOfIntervals = Math.floor(totalDurationInSeconds / interval);
  let timeStep = interval / (365 * 24 * 60 * 60); // converting interval from seconds to years

  const mu = drift;
  const dt = timeStep;
  const S0 = startPrice;
  const N = numberOfIntervals;

  // Implement GBM Egarch
  const S = [S0];
  for (let i = 1; i < N; i++) {
    const t = dt * i;
    const W = Math.sqrt(dt) * randn_bm();
    const St =
      S[S.length - 1] *
      Math.exp(
        (mu - Math.exp(logVariances[i]) / 2) * t +
          Math.sqrt(Math.exp(logVariances[i])) * W,
      );
    S.push(St);
    let residuals = Math.log(S[i] / S[i - 1]);
    logVariances[i] =
      alpha * Math.abs(residuals) +
      gamma * residuals +
      beta * logVariances[i - 1];
  }
  return S;
}
