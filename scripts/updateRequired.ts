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
            dedustVaultAddress: Address.parse('EQClBW0bHE1REnfweZwHva5opOrLuHJRoW21rbSuVPmcGS3e'),
            dedustRouterAddress: Address.parse('EQBfBWT7X2BHg9tXAxzhz2aKiNTU1tpt5NsiK0uSDW_YAJ67'),
            liquidityDepositAddress: Address.parse('EQDWfhKei2kZD2-ySQnRJDDQXa47LfBgDHAV8Rc6BovGNdhr'),
            poolAddress: Address.parse('EQBKZ7sda7Y3P2AOiXg_vI5noY8PhcmNNW9Ufy-A89cc_YEt'),
        },
    );

    await provider.waitForDeploy(jettonMinter.address);

    // run methods on `jetton`
}
