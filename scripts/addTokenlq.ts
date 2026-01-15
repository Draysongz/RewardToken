import { Asset, Factory, JettonRoot, MAINNET_FACTORY_ADDR, PoolType, ReadinessStatus, VaultJetton } from '@dedust/sdk';
import { toNano } from '@ton/core';
import { minterAddress } from '../utils';
import { NetworkProvider } from '@ton/blueprint';
import { Address } from '@ton/core';

const pdAmount = toNano('65000000'); // 65000 PD
const jettonAmount = toNano('49000000'); // 49 million jetto

// const TON = Asset.native();

const PD = Asset.jetton(Address.parse('EQBCDdOHy1Ub6gN1OUd2PpJ8yswkzBsVg56Fi9L8PKSlFkdt'));
const JETTON = Asset.jetton(minterAddress);
const pdAddress= Address.parse('EQBCDdOHy1Ub6gN1OUd2PpJ8yswkzBsVg56Fi9L8PKSlFkdt')

const assets: [Asset, Asset] = [PD, JETTON];
const targetBalances: [bigint, bigint] = [pdAmount, jettonAmount];



const poolType = PoolType.VOLATILE;

export async function run(provider: NetworkProvider) {
    const sender = provider.sender();
    const address = sender.address;
    if (!address) return;

    const factory = provider.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));

    const pdVault = provider.open(await factory.getJettonVault(pdAddress));
    const pool = provider.open(await factory.getPool(poolType, assets));
    const minterVault = provider.open(await factory.getJettonVault(minterAddress));

    const minter = provider.open(JettonRoot.createFromAddress(minterAddress));
    const pd=  provider.open(JettonRoot.createFromAddress(pdAddress));
    const senderWallet = provider.open(await minter.getWallet(sender.address));
    const pdWallet =  provider.open(await pd.getWallet(sender.address));

    if ((await minterVault.getReadinessStatus()) === ReadinessStatus.NOT_DEPLOYED) {
        console.log('Vault does not exist. Creating...');
        await factory.sendCreateVault(sender, {
            asset: JETTON,
        });

        console.log('Waiting for Vault deployment...');
        await new Promise((r) => setTimeout(r, 3000));
    }

        if ((await pdVault.getReadinessStatus()) === ReadinessStatus.NOT_DEPLOYED) {
        console.log('Vault does not exist. Creating...');
        await factory.sendCreateVault(sender, {
            asset: PD,
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



        await pdWallet.sendTransfer(sender, toNano('0.5'), {
        amount: pdAmount,
        destination: pdVault.address,
        responseAddress: sender.address,
        forwardAmount: toNano('0.4'),
        forwardPayload: VaultJetton.createDepositLiquidityPayload({
            poolType,
            assets,
            targetBalances,
        }),
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
