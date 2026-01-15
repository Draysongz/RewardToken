import { Asset, Factory, MAINNET_FACTORY_ADDR, PoolType } from '@dedust/sdk';
import { Address, TonClient4 } from '@ton/ton';
import { minterAddress } from '../utils';

const tonClient = new TonClient4({ endpoint: 'https://mainnet-v4.tonhubapi.com' });
const factory = tonClient.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));

export async function getDedustAddresses(owner: Address) {
    const minterVault = tonClient.open(await factory.getJettonVault(minterAddress));
    const TON = Asset.native();
    const PD =  Asset.jetton(Address.parse('EQBCDdOHy1Ub6gN1OUd2PpJ8yswkzBsVg56Fi9L8PKSlFkdt'));
    const JETTON = Asset.jetton(minterAddress);
    const assets: [Asset, Asset] = [PD, JETTON];

    const pool = tonClient.open(await factory.getPool(PoolType.VOLATILE, assets));
    const poolAddress = await factory.getPoolAddress({ poolType: PoolType.VOLATILE, assets });
    // const lqDepositAddress = await factory.getLiquidityDepositAddress({})

    const getLiquidityDepositAddress = await factory.getLiquidityDepositAddress({
        ownerAddress: owner,
        poolType: PoolType.VOLATILE,
        assets,
    });

    return {
        vault: minterVault.address,
        pool: pool.address,
        router: MAINNET_FACTORY_ADDR,
        poolAddress,
        // ton: TON?.address?.toString() ?? '',
        liquidityDepositAddress: getLiquidityDepositAddress,
    };
}

getDedustAddresses(Address.parse('UQBxzBaa45enb6bo_0Gvx6G6wRdJDFzcd9vh1aUvfM9-Oe-U')).then((data) => console.log(data));

// EQA0tIRLDnsSxcfajbDLP45UXV8ySt5Ly0Q4hcC-s5KJpfeh
