import { Address, beginCell } from '@ton/core';



export type JettonMinterContent = {
    type: 0 | 1;
    uri: string;
};

export const minterAddress = Address.parse('kQCYpHtHC1tv28i0Pu2vC_rCyUYvV7FHqrRNtCUVElun8pR3');

export const zeroAddress = Address.parse('UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ');

export function jettonContentToCell(content: JettonMinterContent) {
    return beginCell()
        .storeUint(content.type, 8)
        .storeStringTail(content.uri) //Snake logic under the hood
        .endCell();
}
