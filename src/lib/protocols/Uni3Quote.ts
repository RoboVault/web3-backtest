import { ethers } from 'ethers';
import { Univ3QuoterAbi } from '../abis/Univ3Quoter.js';
import { toBigNumber, toNumber } from '../utils/utility.js';
const RPC = 'https://mainnet.infura.io/v3/5e5034092e114ffbb3d812b6f7a330ad';
const Univ3QuoterAddress = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';
export class Uni3Quote {
  static quoter(): ethers.Contract {
    const provider = new ethers.providers.JsonRpcProvider(RPC);
    return new ethers.Contract(
      Univ3QuoterAddress,
      Univ3QuoterAbi as any,
      provider,
    );
  }

    static async getQuote(fromToken: string, fromDecimals: number, toToken: string, toDecimals:number, amountFrom: number,  block: number, pool: string){
        const quoter = this.quoter()
        const bigNumber = toBigNumber(amountFrom)
        const quote = await quoter.callStatic.quoteExactInputSingle(fromToken, toToken, 500, bigNumber, 0, {blockTag: block})
        //console.log(quote)
        return toNumber(quote, toDecimals)
		// 	abi: Univ3QuoterAbi,
		// 	address: Univ3QuoterAddress,
		// 	functionName: "quoteExactInputSingle",
		// 	args: [fromToken, toToken, 500, ethers.parseUnits('1', fromDecimals), 0],
		// 	blockNumber: block,
		// })
		//return toNumber(result as bigint, toDecimals)
    }
}
