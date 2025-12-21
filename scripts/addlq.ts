import { Asset, Factory, JettonRoot, MAINNET_FACTORY_ADDR, PoolType, ReadinessStatus, VaultJetton } from '@dedust/sdk';
import { toNano } from '@ton/core';
import { minterAddress } from '../utils';
import { NetworkProvider } from '@ton/blueprint';

const tonAmount = toNano('5'); // 10 ton
const jettonAmount = toNano('1000000'); // 1 million jetton

const TON = Asset.native();
const JETTON = Asset.jetton(minterAddress);

const assets: [Asset, Asset] = [TON, JETTON];
const targetBalances: [bigint, bigint] = [tonAmount, jettonAmount];

const poolType = PoolType.VOLATILE;

export async function run(provider: NetworkProvider) {
    const sender = provider.sender();
    const address = sender.address;
    if (!address) return;

    const factory = provider.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));

    const tonVault = provider.open(await factory.getNativeVault());
    const pool = provider.open(await factory.getPool(poolType, assets));
    const minterVault = provider.open(await factory.getJettonVault(minterAddress));

    const minter = provider.open(JettonRoot.createFromAddress(minterAddress));
    const senderWallet = provider.open(await minter.getWallet(sender.address));

    if ((await minterVault.getReadinessStatus()) === ReadinessStatus.NOT_DEPLOYED) {
        console.log('Vault does not exist. Creating...');
        await factory.sendCreateVault(sender, {
            asset: JETTON,
        });

        console.log('Waiting for Vault deployment...');
        await new Promise((r) => setTimeout(r, 3000));
    }

    if ((await pool.getReadinessStatus()) === ReadinessStatus.NOT_DEPLOYED) {
        console.log('Pool does not exist. Creating...');
        await factory.sendCreateVolatilePool(sender, {
            assets: assets,
        });

        console.log('Waiting for Pool deployment...');
        await new Promise((r) => setTimeout(r, 3000));
    }

    console.log('Addresses initialized');

    await tonVault.sendDepositLiquidity(sender, {
        poolType: PoolType.VOLATILE,
        assets,
        targetBalances,
        amount: tonAmount,
    });

    // deposit dedust to vault

    await senderWallet.sendTransfer(sender, toNano('0.5'), {
        amount: jettonAmount,
        destination: minterVault.address,
        responseAddress: sender.address,
        forwardAmount: toNano('0.4'),
        forwardPayload: VaultJetton.createDepositLiquidityPayload({
            poolType,
            assets,
            targetBalances,
        }),
    });

    console.log('Liquidity added! Pool initialized.');
}
