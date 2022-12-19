export const UniV2PoolAbi = [
    {
        'inputs': [
            {
                'internalType': "int24",
                'name': "tickLower",
                'type': "int24"
            },
            {
                'internalType': "int24",
                'name': "tickUpper",
                'type': "int24"
            },
            {
                'internalType': "uint128",
                'name': "amount",
                'type': "uint128"
            }
        ],
        'name': "burn",
        'outputs': [
            {
                'internalType': "uint256",
                'name': "amount0",
                'type': "uint256"
            },
            {
                'internalType': "uint256",
                'name': "amount1",
                'type': "uint256"
            }
        ],
        'stateMutability': "nonpayable",
        'type': "function"
    },
    {
        'inputs': [
            {
                'internalType': "address",
                'name': "recipient",
                'type': "address"
            },
            {
                'internalType': "int24",
                'name': "tickLower",
                'type': "int24"
            },
            {
                'internalType': "int24",
                'name': "tickUpper",
                'type': "int24"
            },
            {
                'internalType': "uint128",
                'name': "amount0Requested",
                'type': "uint128"
            },
            {
                'internalType': "uint128",
                'name': "amount1Requested",
                'type': "uint128"
            }
        ],
        'name': "collect",
        'outputs': [
            {
                'internalType': "uint128",
                'name': "amount0",
                'type': "uint128"
            },
            {
                'internalType': "uint128",
                'name': "amount1",
                'type': "uint128"
            }
        ],
        'stateMutability': "nonpayable",
        'type': "function"
    },
    {
        'inputs': [],
        'name': "fee",
        'outputs': [
            {
                'internalType': "uint24",
                'name': "",
                'type': "uint24"
            }
        ],
        'stateMutability': "view",
        'type': "function"
    },
    {
        'inputs': [
            {
                'internalType': "address",
                'name': "recipient",
                'type': "address"
            },
            {
                'internalType': "int24",
                'name': "tickLower",
                'type': "int24"
            },
            {
                'internalType': "int24",
                'name': "tickUpper",
                'type': "int24"
            },
            {
                'internalType': "uint128",
                'name': "amount",
                'type': "uint128"
            },
            {
                'internalType': "bytes",
                'name': "data",
                'type': "bytes"
            }
        ],
        'name': "mint",
        'outputs': [
            {
                'internalType': "uint256",
                'name': "amount0",
                'type': "uint256"
            },
            {
                'internalType': "uint256",
                'name': "amount1",
                'type': "uint256"
            }
        ],
        'stateMutability': "nonpayable",
        'type': "function"
    },
    {
        'inputs': [
            {
                'internalType': "uint32[]",
                'name': "secondsAgos",
                'type': "uint32[]"
            }
        ],
        'name': "observe",
        'outputs': [
            {
                'internalType': "int56[]",
                'name': "tickCumulatives",
                'type': "int56[]"
            },
            {
                'internalType': "uint160[]",
                'name': "secondsPerLiquidityCumulativeX128s",
                'type': "uint160[]"
            }
        ],
        'stateMutability': "view",
        'type': "function"
    },
    {
        'inputs': [
            {
                'internalType': "bytes32",
                'name': "key",
                'type': "bytes32"
            }
        ],
        'name': "positions",
        'outputs': [
            {
                'internalType': "uint128",
                'name': "_liquidity",
                'type': "uint128"
            },
            {
                'internalType': "uint256",
                'name': "feeGrowthInside0LastX128",
                'type': "uint256"
            },
            {
                'internalType': "uint256",
                'name': "feeGrowthInside1LastX128",
                'type': "uint256"
            },
            {
                'internalType': "uint128",
                'name': "tokensOwed0",
                'type': "uint128"
            },
            {
                'internalType': "uint128",
                'name': "tokensOwed1",
                'type': "uint128"
            }
        ],
        'stateMutability': "view",
        'type': "function"
    },
    {
        'inputs': [],
        'name': "slot0",
        'outputs': [
            {
                'internalType': "uint160",
                'name': "sqrtPriceX96",
                'type': "uint160"
            },
            {
                'internalType': "int24",
                'name': "tick",
                'type': "int24"
            },
            {
                'internalType': "uint16",
                'name': "observationIndex",
                'type': "uint16"
            },
            {
                'internalType': "uint16",
                'name': "observationCardinality",
                'type': "uint16"
            },
            {
                'internalType': "uint16",
                'name': "observationCardinalityNext",
                'type': "uint16"
            },
            {
                'internalType': "uint8",
                'name': "feeProtocol",
                'type': "uint8"
            },
            {
                'internalType': "bool",
                'name': "unlocked",
                'type': "bool"
            }
        ],
        'stateMutability': "view",
        'type': "function"
    },
    {
        'inputs': [
            {
                'internalType': "address",
                'name': "recipient",
                'type': "address"
            },
            {
                'internalType': "bool",
                'name': "zeroForOne",
                'type': "bool"
            },
            {
                'internalType': "int256",
                'name': "amountSpecified",
                'type': "int256"
            },
            {
                'internalType': "uint160",
                'name': "sqrtPriceLimitX96",
                'type': "uint160"
            },
            {
                'internalType': "bytes",
                'name': "data",
                'type': "bytes"
            }
        ],
        'name': "swap",
        'outputs': [
            {
                'internalType': "int256",
                'name': "amount0",
                'type': "int256"
            },
            {
                'internalType': "int256",
                'name': "amount1",
                'type': "int256"
            }
        ],
        'stateMutability': "nonpayable",
        'type': "function"
    },
    {
        'inputs': [],
        'name': "tickSpacing",
        'outputs': [
            {
                'internalType': "int24",
                'name': "",
                'type': "int24"
            }
        ],
        'stateMutability': "view",
        'type': "function"
    },
    {
        'inputs': [],
        'name': "token0",
        'outputs': [
            {
                'internalType': "address",
                'name': "",
                'type': "address"
            }
        ],
        'stateMutability': "view",
        'type': "function"
    },
    {
        'inputs': [],
        'name': "token1",
        'outputs': [
            {
                'internalType': "address",
                'name': "",
                'type': "address"
            }
        ],
        'stateMutability': "view",
        'type': "function"
    }
]