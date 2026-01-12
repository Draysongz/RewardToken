import { Address, beginCell } from '@ton/core';



export type JettonMinterContent = {
    type: 0 | 1;
    uri: string;
};

export const minterAddress = Address.parse('EQCWVX1s8-Vgesy6G226-6s5NouspXlp0GLP3N3nmxGv6U5S');

export const zeroAddress = Address.parse('UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ');

export function jettonContentToCell(content: JettonMinterContent) {
    return beginCell()
        .storeUint(content.type, 8)
        .storeStringTail(content.uri) //Snake logic under the hood
        .endCell();
}
