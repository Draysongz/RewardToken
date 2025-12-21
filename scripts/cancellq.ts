import { Asset, Factory, MAINNET_FACTORY_ADDR, PoolType } from '@dedust/sdk';
import { NetworkProvider } from '@ton/blueprint';
import { minterAddress } from '../utils';

const TON = Asset.native();
const JETTON = Asset.jetton(minterAddress);

const assets: [Asset, Asset] = [TON, JETTON];

export async function run(provider: NetworkProvider) {
    const sender = provider.sender();
    const address = sender.address;
    if (!address) return;

    const factory = provider.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));
    const liquidityDeposit = provider.open(
        await factory.getLiquidityDeposit({
            ownerAddress: sender.address,
            poolType: PoolType.VOLATILE,
            assets,
        }),
    );

    await liquidityDeposit.sendCancelDeposit(sender, {});
}
