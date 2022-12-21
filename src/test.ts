import * as jsbi from 'jsbi'
const JSBI: any = jsbi


async function main () {
    // console.log(jsbi)
    const x = JSBI.BigInt(12)
    const y = JSBI.BigInt(10)
    console.log(JSBI.multiply(x, y).toString())
}

export default main()

