import { Asset, Factory, MAINNET_FACTORY_ADDR, PoolType } from '@dedust/sdk';
import { NetworkProvider } from '@ton/blueprint';
import { minterAddress } from '../utils';
import { toNano } from '@ton/core';

const TON = Asset.native();
const JETTON = Asset.jetton(minterAddress);

const assets: [Asset, Asset] = [TON, JETTON];

export async function run(provider: NetworkProvider) {
    const sender = provider.sender();
    const address = sender.address;
    if (!address) return;
    const factory = provider.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));

    const pool = provider.open(await factory.getPool(PoolType.VOLATILE, assets));
    const lpWallet = provider.open(await pool.getWallet(sender.address));

    // await lpWallet.sendBurn(sender, toNano('0.5'), {
    // amount: ,
    // });
    const lpBal = await lpWallet.getBalance();

    console.log({ lpBal });
}
