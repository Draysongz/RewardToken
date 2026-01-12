import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { jettonContentToCell, minterAddress } from '../utils';
import { JettonMinterStandard } from '../build/Jetton/Jetton_JettonMinterStandard';

export async function run(provider: NetworkProvider) {
    const sender = provider.sender();
    const senderAddress = sender.address;
    if (!senderAddress) return;

    const jettonMinter = provider.open(
        await JettonMinterStandard.fromAddress(minterAddress));

    await jettonMinter.send(
        provider.sender(),
        {
            value: toNano('0.1'),
        },
        {
            $$type: 'UpdateRequiredAddresses',
            dedustVaultAddress: Address.parse('EQC9gxngYSj1hnuD8WiPklrthTsm2VTpshAjPG1X35UCtFDo'),
            dedustRouterAddress: Address.parse('EQBfBWT7X2BHg9tXAxzhz2aKiNTU1tpt5NsiK0uSDW_YAJ67'),
            liquidityDepositAddress: Address.parse('EQCoUu_l23k_PmgZq2Dq-ILzGLgb1CH8r2cEjB0hr7zXV6ob'),
            poolAddress: Address.parse('EQAwtFSXrcTWdaqqF5L7YLXV7Q8KA2DGXPJGfb9XzYUczJPv'),
        },
    );

    await provider.waitForDeploy(jettonMinter.address);

    // run methods on `jetton`
}
