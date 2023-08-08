export class Stats {
  // Calculate the average of all the numbers
  static mean(values: number[]) {
    const mean = values.reduce((sum, current) => sum + current) / values.length;
    return mean;
  }

  // Calculate variance
  static variance(values: number[]) {
    const average = Stats.mean(values);
    const squareDiffs = values.map((value) => {
      const diff = value - average;
      return diff * diff;
    });
    const variance = Stats.mean(squareDiffs);
    return variance;
  }

  // Calculate stand deviation
  static stddev(variance: number) {
    return Math.sqrt(variance);
  }
}
