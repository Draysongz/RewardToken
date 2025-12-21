import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { jettonContentToCell } from '../utils';
import { JettonMinterStandard } from '../build/Jetton/Jetton_JettonMinterStandard';

export async function run(provider: NetworkProvider) {
    const sender = provider.sender();
    const senderAddress = sender.address;
    if (!senderAddress) return;

    const jettonMinter = provider.open(
        await JettonMinterStandard.fromInit(
            toNano('0'),
            senderAddress,
            jettonContentToCell({
                type: 1,
                uri: 'https://moccasin-bright-skunk-108.mypinata.cloud/ipfs/bafkreigmh4ua45ujyietfibm7lqdtfa7mmeglqanmw4yyw4qcr57lcj2sq',
            }),
            true,
            Address.parse('UQD_t9e_dF4ADstJ8O_k_cS7GtOm9vOls2XHCWbjD8EoxUHa'),
            500n, // buyTaxBps: 500 = 5% (in basis points)
            500n, // sellTaxBps: 500 = 5% (in basis points)
        ),
    );

    await jettonMinter.send(
        provider.sender(),
        {
            value: toNano('0.1'),
        },
        null,
    );

    await provider.waitForDeploy(jettonMinter.address);

    // run methods on `jetton`
}
