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
               uri: 'https://moccasin-bright-skunk-108.mypinata.cloud/ipfs/bafkreidt5s6e24vezvqxrd226ghl6bkubnagq4tplst622n5xlokhanamu',
           }),
           true,
           Address.parse('0QADdMcEV9Voo-X1NDLtPcl4TYr5tvxgsbl7q0ij-JOFXY05'),
           toNano(500),
           toNano(500),
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
