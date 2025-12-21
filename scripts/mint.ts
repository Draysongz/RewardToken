import { NetworkProvider } from '@ton/blueprint';
import { JettonMinterStandard, Mint } from '../build/Jetton/Jetton_JettonMinterStandard';
import { minterAddress } from '../utils';
import { Address, beginCell, toNano } from '@ton/core';

function formMintBody(receiver: Address, responseDestination: Address, amount: string) {
    const mintBody: Mint = {
        $$type: 'Mint',
        queryId: 1n,
        receiver,
        tonAmount: toNano('0.01'),
        mintMessage: {
            $$type: 'JettonTransferInternal',
            queryId: 2n,
            responseDestination,
            amount: toNano(amount),
            forwardTonAmount: 0n,
            forwardPayload: beginCell().endCell().asSlice(),
            sender: receiver,
        },
    };

    return mintBody;
}

export async function run(provider: NetworkProvider) {
    const sender = provider.sender();
    const senderAddress = sender.address;
    if (!senderAddress) return;

    const minter = provider.open(
        JettonMinterStandard.fromAddress(minterAddress),
    );

    await minter.send(sender, { value: toNano('0.03') }, formMintBody(senderAddress, senderAddress, '100000000'));
}
