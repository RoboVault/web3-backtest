import * as process from 'process';
import './config.js';

import { ethers } from 'ethers';

export function toNumber(n: ethers.BigNumber, decimals: number = 0): number {
  return parseFloat(ethers.utils.formatUnits(n, decimals));
}
export function toBigNumber(n: number, decimals: number = 0): ethers.BigNumber {
  return ethers.BigNumber.from(`0x${(n * 10 ** decimals).toString(16)}`);
}

export function bigintToNumber(n: bigint, decimals: number = 0): number {
  return Number(n) / (10**decimals);
}

export type Environment = 'DEV' | 'STAG' | 'PROD';

export class Settings {
  public static environment(): Environment {
    switch (process.env.NODE_ENV?.toUpperCase()) {
      case 'DEV':
        return 'DEV';
      case 'STAG':
        return 'STAG';
      case 'PROD':
        return 'PROD';
      default:
        throw new Error('Invalid NODE_ENV configured.');
    }
  }

  public static get(setting: string): string {
    if (!process.env[setting]) {
      throw new Error(`ENV: ${setting} not configured`);
    }
    return process.env[setting] as string;
  }
}

export class Numbers {
  public static logWithBase(y: number, x: number): number {
    return Math.log(y) / Math.log(x);
  }

  public static round(number: number, decimalPlaces: number): number {
    const factorOfTen = Math.pow(10, decimalPlaces);
    return Math.round(number * factorOfTen) / factorOfTen;
  }
}

export const waitFor = (delay: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delay));
