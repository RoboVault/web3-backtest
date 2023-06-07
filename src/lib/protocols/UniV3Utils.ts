// Equations Here:
// https://www.desmos.com/calculator/i8h0wzqaci

export const calculateL = (
  pDeposit: number,
  vDeposit: number,
  pLower: number,
  pUpper: number,
) => {
  if (pDeposit < pLower)
    return (
      vDeposit / (pDeposit * (1 / Math.sqrt(pLower) - 1 / Math.sqrt(pUpper)))
    );
  else if (pDeposit > pUpper)
    return vDeposit / (Math.sqrt(pUpper) - Math.sqrt(pLower));
  else
    return (
      vDeposit /
      (pDeposit * (1 / Math.sqrt(pDeposit) - 1 / Math.sqrt(pUpper)) +
        Math.sqrt(pDeposit) -
        Math.sqrt(pLower))
    );
};

export const getYLower = (pLower: number, pUpper: number, L: number) => {
  return L * Math.sqrt(pLower);
};

export const getXUpper = (pLower: number, pUpper: number, L: number) => {
  return L / Math.sqrt(pUpper);
};

export const getYMax = (pLower: number, pUpper: number, L: number) => {
  return (Math.sqrt(pUpper) - Math.sqrt(pLower)) * L;
};

export const getXMax = (pLower: number, pUpper: number, L: number) => {
  return (1 / Math.sqrt(pLower) - 1 / Math.sqrt(pUpper)) * L;
};
export const getXReal = (
  pCurrent: number,
  pLower: number,
  pUpper: number,
  L: number,
) => {
  if (pCurrent < pLower) return getXMax(pLower, pUpper, L);
  else if (pCurrent > pUpper) return 0;
  else return L / Math.sqrt(pCurrent) - getXUpper(pLower, pUpper, L);
};
export const getYReal = (
  pCurrent: number,
  pLower: number,
  pUpper: number,
  L: number,
) => {
  if (pCurrent < pLower) return 0;
  else if (pCurrent > pUpper) return getYMax(pLower, pUpper, L);
  else return L * Math.sqrt(pCurrent) - getYLower(pLower, pUpper, L);
};

export const getXLP = (
  pCurrent: number,
  pLower: number,
  pUpper: number,
  L: number,
) => {
  return getXReal(pCurrent, pLower, pUpper, L) * pCurrent;
};

export const getYLP = (
  pCurrent: number,
  pLower: number,
  pUpper: number,
  L: number,
) => {
  return getYReal(pCurrent, pLower, pUpper, L) * pCurrent;
};

export const getVLP = (
  pCurrent: number,
  pLower: number,
  pUpper: number,
  L: number,
) => {
  const x = getXLP(pCurrent, pLower, pUpper, L);
  const y = getYLP(pCurrent, pLower, pUpper, L);
  return x + y;
};
