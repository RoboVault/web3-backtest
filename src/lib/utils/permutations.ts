/**
 * @brief Returns all permutations of an array of arrays
 */
export function permutations(arr: number[][]): number[][] {
  const result: number[][] = [];

  function generate(index: number, current: number[]): void {
    if (index === arr.length) {
      result.push(current.slice());
      return;
    }
    for (let i = 0; i < arr[index].length; i++) {
      current.push(Number(arr[index][i].toFixed(4)));
      generate(index + 1, current);
      current.pop();
    }
  }

  generate(0, []);

  return result;
}
