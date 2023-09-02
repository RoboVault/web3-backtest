import { Bin, JoesV2PoolSnapshot } from '../../../lib/datasource/joesv2Dex.js';
import { Rebalance } from './models/rebalance.js';
const fromHex = (hex: string) => {
  return parseInt(hex, 16);
};

export class JoesV2AutoPoolStrategy {
  public entryPrice: number;
  public centreBin: number;
  public snapshot: any = {};
  public position: {
    bin: number;
    supply: number;
    base?: number;
    quote?: number;
  }[] = []; // the supply held in the bins
  public bins: Bin[] = [];

  public constructor(
    public options: {
      tags: any;
      amountInQuote: number;
      binRange: number;
      rebalanceBin: number; // rebalance if the bin drift hits this
      rebalance: boolean;
    },
    data: JoesV2PoolSnapshot,
  ) {
    this.mergeBins(this.bins, data.bins);
    this.entryPrice = data.price;
    this.centreBin = data.activeBin;
    this.createSpotPosition(data, options.amountInQuote);
    this.updateSnapshot(data);
  }

  public async process(data: JoesV2PoolSnapshot) {
    this.mergeBins(this.bins, data.bins);

    if (this.options.rebalance) {
      const { rebalanceBin } = this.options;
      const binDrift = Math.abs(data.activeBin - this.centreBin);
      if (binDrift > rebalanceBin) {
        const amount = this.liquidate(data);
        this.createSpotPosition(data, amount);
        await this.logRebalance(data.timestamp);
      }
    }

    return this.updateSnapshot(data);
  }

  private async logRebalance(timestamp: number) {
    await Rebalance.writePointBatched({
      tags: {
        ...this.options.tags,
      },
      fields: {
        ...this.snapshot,
      },
      timestamp: new Date(timestamp * 1000),
    });
  }

  private mergeBins(target: Bin[], newBins: Bin[]) {
    for (const bin of newBins) {
      const existing = target.find((e) => e.id === bin.id);
      if (existing) {
        existing.reserveX = bin.reserveX;
        existing.reserveY = bin.reserveY;
        existing.supply = bin.supply;
      } else {
        target.push(bin);
      }
    }
  }

  private liquidate(data: JoesV2PoolSnapshot) {
    const baseAmount = this.balanceBase(this.bins);
    const quoteAmount = this.balanceQuote(this.bins);
    this.position = [];
    return baseAmount * data.price + quoteAmount;
  }

  private balanceBase(bins: Bin[]) {
    return this.position
      .map((pos) => {
        const bin = bins.find((e) => e.id === pos.bin);
        if (!bin) {
          throw new Error(
            'Missing bin in data. More data is required for this strategy',
          );
          return 0;
        }
        // if the position supply is 1, tis means there was no liquidity in this bin
        // when the position was created or updated.
        const binSupply = this.supplyFromHex(bin.supply);
        let posSupply = pos.supply;
        if (posSupply === 1) {
          if (binSupply === 0) return bin.reserveX;
          return pos.base || 0;
        }

        return bin.reserveX === 0 ? 0 : (bin.reserveX * pos.supply) / binSupply;
      })
      .reduce((a, b) => a + b, 0);
  }

  private balanceQuote(bins: Bin[]) {
    return this.position
      .map((pos) => {
        const bin = bins.find((e) => e.id === pos.bin);
        if (!bin) {
          throw new Error(
            'Missing bin in data. More data is required for this strategy',
          );
          return 0;
        }
        // if the position supply is 1, tis means there was no liquidity in this bin
        // when the position was created or updated.
        const binSupply = this.supplyFromHex(bin.supply);
        let posSupply = pos.supply;
        if (posSupply === 1) {
          if (binSupply === 0) return bin.reserveY;
          return pos.quote || 0;
        }

        return bin.reserveY === 0
          ? 0
          : (bin.reserveY * pos.supply) / this.supplyFromHex(bin.supply);
      })
      .reduce((a, b) => a + b, 0);
  }

  private updateSnapshot(data: JoesV2PoolSnapshot) {
    const baseAmount = this.balanceBase(this.bins);
    const quoteAmount = this.balanceQuote(this.bins);
    const price = data.price;
    const valueQuote = baseAmount * price + quoteAmount;
    const baseValue = baseAmount * price;

    // console.log('valueQuote', valueQuote)
    this.snapshot = {
      baseAmount,
      quoteAmount,
      baseValue,
      price,
      valueQuote,
      binDrift: data.activeBin - this.centreBin,
    };
    return this.snapshot;
  }

  private valueInQuote(base: number, quote: number, price: number) {
    return base * price + quote;
  }

  // returns the bin supply you would receive if you deposited the deposit into the bin
  private depositIntoActiveBin(
    price: number,
    deposit: { base: number; quote: number },
    bin: Bin,
  ): number {
    const binValue = this.valueInQuote(bin.reserveX, bin.reserveY, price);
    const depositValue = this.valueInQuote(deposit.base, deposit.quote, price);
    return (depositValue / binValue) * this.supplyFromHex(bin.supply);
  }

  private supplyFromHex(hex: string) {
    return fromHex(hex) / 1e32;
  }

  private activeBin(data: JoesV2PoolSnapshot) {
    let id = data.activeBin;
    while (true) {
      const bin = data.bins.find((e) => e.id === id);
      if (!bin) {
        console.log(data.bins);
        throw new Error('Cannot find an active bin');
      }

      if (bin.reserveX > 0 || bin.reserveY > 0) return id;
      id++;
    }
  }

  private createSpotPosition(data: JoesV2PoolSnapshot, amountInQuote: number) {
    const { binRange } = this.options;
    const price = data.price;
    const quote = amountInQuote / 2;
    const base = quote / price;
    const activeBinId = this.activeBin(data);
    const nBins = binRange * 2 + 1;
    const quoteValuePerBin = amountInQuote / nBins;
    const activeBin = this.bins.find((e) => e.id === activeBinId)!;
    this.centreBin = data.activeBin;

    const activeBinBase =
      quoteValuePerBin / (price + activeBin.reserveX / activeBin.reserveY);
    const activeBinQuote = activeBinBase - activeBinBase * price;

    const quoteSplit = (quote - activeBinQuote) / binRange;
    const baseSplit = (base - activeBinBase) / binRange;

    if (isNaN(quoteSplit)) {
      console.log('QUOTE SPLIT NAN');
      console.log({
        price,
        quote,
        base,
        activeBinId,
        nBins,
        quoteValuePerBin,
        activeBin,
      });
      console.log(this.options.tags);
      process.exit();
    }

    // Quote bins
    for (let id = activeBinId - binRange; id < activeBinId; id++) {
      const bin = this.bins.find((e) => e.id === id)!;
      const getPosition = () => {
        // if the bin has no liquidity, then the position supply is 1
        if (bin.reserveY === 0) {
          return {
            bin: id,
            supply: 1,
            quote: quoteSplit,
          };
        } else {
          const supply =
            (quoteSplit / bin.reserveY) * this.supplyFromHex(bin.supply);
          if (isNaN(supply)) {
            console.log(
              quoteSplit,
              bin.reserveY,
              this.supplyFromHex(bin.supply),
            );
            console.log('found NaN 3');
            process.exit();
          }
          return {
            bin: id,
            supply,
          };
        }
      };
      this.position.push(getPosition());
    }

    // Active bin
    this.position.push({
      bin: activeBinId,
      supply: this.depositIntoActiveBin(
        price,
        { base: activeBinBase / 2, quote: activeBinQuote / 2 },
        this.bins.find((e) => e.id === activeBinId)!,
      ),
    });

    // Base bins
    for (let id = activeBinId + 1; id <= activeBinId + binRange; id++) {
      const bin = this.bins.find((e) => e.id === id)!;
      const getPosition = () => {
        // if the bin has no liquidity, then the position supply is 1
        if (bin.reserveX === 0) {
          return {
            bin: id,
            supply: 1,
            base: baseSplit,
          };
        } else {
          const supply =
            (baseSplit / bin.reserveX) * this.supplyFromHex(bin.supply);
          if (isNaN(supply)) {
            console.log(
              baseSplit,
              bin.reserveX,
              this.supplyFromHex(bin.supply),
            );
            console.log('found NaN 2');
            process.exit();
          }
          return {
            bin: id,
            supply,
          };
        }
      };
      this.position.push(getPosition());
    }

    for (const pos of this.position) {
      if (isNaN(pos.supply)) {
        console.log(this.bins);
        console.log(this.position);
        console.log('found NaN');
        process.exit();
      }
    }
    // let baseAmount = 0
    // let quoteAmount = 0
    // for (const pos of this.position) {
    //   const bin = bins.find(e => e.id === pos.bin)!
    //   // console.log(bin)
    //   const ratio = pos.supply / this.supplyFromHex(bin.supply)
    //   console.log(ratio, bin.reserveX * ratio, bin.reserveY * ratio)
    //   baseAmount += bin.reserveX * ratio
    //   quoteAmount += bin.reserveY * ratio
    // }
    // const baseAmount2 = this.balanceBase(data.bins)
    // const quoteAmount2 = this.balanceQuote(data.bins)
    // console.log('deposit amounts')
    // console.log({base, quote})
    // console.log('price', price)
    // console.log(base * price + quote)
    // console.log()
    // console.log({baseAmount, quoteAmount})
    // console.log({baseAmount2, quoteAmount2})
    // console.log(baseAmount * price + quoteAmount)
    // process.exit()
  }
}
