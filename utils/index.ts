import { Address, beginCell } from '@ton/core';



export type JettonMinterContent = {
    type: 0 | 1;
    uri: string;
};

export const minterAddress = Address.parse('EQBpCY2cKdmSrS6LC7ZJJ3AQ4ywFmaRoL9JBhTgZl2znf9gH');

export const zeroAddress = Address.parse('UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ');

export function jettonContentToCell(content: JettonMinterContent) {
    return beginCell()
        .storeUint(content.type, 8)
        .storeStringTail(content.uri) //Snake logic under the hood
        .endCell();
}
