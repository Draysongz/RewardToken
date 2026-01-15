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
            dedustVaultAddress: Address.parse('EQBL8w8jmBmLTr8EWIwkkTF1QKx8gXfL3qjTp6FforV3mOe7'),
            dedustRouterAddress: Address.parse('EQBfBWT7X2BHg9tXAxzhz2aKiNTU1tpt5NsiK0uSDW_YAJ67'),
            liquidityDepositAddress: Address.parse('EQDLyJN-gnmQednlnDLO6sTXqDtUigoZpVQGFwQm4H3OEdAa'),
            poolAddress: Address.parse('EQDaaoCwkEIyv0A32DcSs1FU624sCUd38o9u0WHOpE6HhbGl'),
            tokenDedustVaultAddress:  Address.parse('EQBL8w8jmBmLTr8EWIwkkTF1QKx8gXfL3qjTp6FforV3mOe7') ,
            tokenLiquidityDepositAddress: Address.parse('EQDIjWhvwyn5ykYwwn8j45-Wey2PV089bva1R8kA95d37RJB'),
            tokenPoolAddress: Address.parse('EQD0AKVi60rvxLzc8XU20ngEwQeedMqRXtMXsuY7h2VMXx3j'),
        },
    );

    await provider.waitForDeploy(jettonMinter.address);

    // run methods on `jetton`
}
