import { Address, toNano, beginCell } from '@ton/core';
import { TonClient4, WalletContractV4, internal } from '@ton/ton';
import { Factory, MAINNET_FACTORY_ADDR, Asset, PoolType, ReadinessStatus } from '@dedust/sdk';
import { minterAddress } from '../utils';

const TONAPI_BASE = 'https://tonapi.io/v2';

const DISTRIBUTOR_WALLET_PUBLIC_KEY = Buffer.from('<PUBLIC_KEY_HEX>', 'hex');
const DISTRIBUTOR_WALLET_WORKCHAIN = 0; // usually 0
const DISTRIBUTOR_WALLET_SECRET_KEY = Buffer.from('<SECRET_KEY_HEX>', 'hex');

const JETTON_MINTER = minterAddress;

const REWARD_JETTON_MINTER = Address.parse('<REWARD_JETTON_MINTER>');

const FEE_JETTON_WALLET = Address.parse('<FEE_JETTON_WALLET_ADDRESS>');
const REWARD_JETTON_WALLET = Address.parse('<REWARD_JETTON_WALLET_ADDRESS>');

const TON_ENDPOINT = 'https://mainnet-v4.tonhubapi.com';

const AMOUNT_TO_SWAP = toNano('100');

async function fetchHolders(limit: number = 1000) {
    const url = `${TONAPI_BASE}/jetton/wallets?jetton=${JETTON_MINTER.toString()}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch holders: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();

    const wallets = (data.wallets ?? data.accounts ?? []) as {
        address: string;
        balance: string;
        owner: { address: string };
    }[];

    return wallets;
}

function buildJettonTransferBody(amount: bigint, destination: Address) {
    const op = 0xf8a7ea5; // JettonTransfer opcode

    const body = beginCell()
        .storeUint(op, 32)
        .storeUint(0n, 64) // queryId
        .storeCoins(amount) // amount
        .storeAddress(destination) // destination
        .storeAddress(null) // responseDestination
        .storeMaybeRef(null) // customPayload
        .storeCoins(0n) // forwardTonAmount
        .storeBit(0) // empty forwardPayload
        .endCell();

    return body;
}

async function swapFeesToRewardToken(client: TonClient4) {
    const factory = client.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));

    const feeAsset = Asset.jetton(JETTON_MINTER);
    const rewardAsset = Asset.jetton(REWARD_JETTON_MINTER);

    const pool = client.open(await factory.getPool(PoolType.VOLATILE, [feeAsset, rewardAsset]));
    const readiness = await pool.getReadinessStatus();
    if (readiness !== ReadinessStatus.READY) {
        throw new Error(`DeDust pool not ready: status = ${readiness}`);
    }

    const feeVault = client.open(await factory.getJettonVault(JETTON_MINTER));

    const wallet = WalletContractV4.create({
        workchain: DISTRIBUTOR_WALLET_WORKCHAIN,
        publicKey: DISTRIBUTOR_WALLET_PUBLIC_KEY,
    });
    const walletContract = client.open(wallet);
    const sender = walletContract.sender(DISTRIBUTOR_WALLET_SECRET_KEY);

    // Swap a fixed amount of fee jettons into reward jettons.
    // The DeDust SDK typings don't expose sendSwap on VaultJetton,
    // so we cast to any to call the underlying method.
    await (feeVault as any).sendSwap(sender, {
        poolAddress: pool.address,
        amount: AMOUNT_TO_SWAP,
        gasAmount: toNano('0.25'),
    });

    console.log('Swap submitted to DeDust');
}

async function fetchRewardWalletBalance(): Promise<bigint> {
    const url = `${TONAPI_BASE}/jetton/wallets?jetton=${REWARD_JETTON_MINTER.toString()}&owner=${REWARD_JETTON_WALLET.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch reward wallet balance: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    const wallet = (data.wallets ?? data.accounts ?? [])[0];
    if (!wallet) return 0n;
    return BigInt(wallet.balance);
}

async function swapAndDistribute() {
    const client = new TonClient4({ endpoint: TON_ENDPOINT });

    await swapFeesToRewardToken(client);

    n;
    const holders = await fetchHolders();
    const totalBalance = holders.reduce((acc, h) => acc + BigInt(h.balance), 0n);

    if (totalBalance === 0n) {
        console.log('No holders with balance; aborting distribution');
        return;
    }

    const totalReward = await fetchRewardWalletBalance();
    if (totalReward === 0n) {
        console.log('No reward tokens available; aborting distribution');
        return;
    }

    console.log('Total holders balance:', totalBalance.toString());
    console.log('Total reward to distribute:', totalReward.toString());

    const wallet = WalletContractV4.create({
        workchain: DISTRIBUTOR_WALLET_WORKCHAIN,
        publicKey: DISTRIBUTOR_WALLET_PUBLIC_KEY,
    });
    const walletContract = client.open(wallet);
    const sender = walletContract.sender(DISTRIBUTOR_WALLET_SECRET_KEY);

    const rewardWalletAddr = REWARD_JETTON_WALLET;
    let used = 0n;

    for (const h of holders) {
        const bal = BigInt(h.balance);
        if (bal === 0n) continue;

        // Proportional share (floor)
        const share = (bal * totalReward) / totalBalance;
        if (share === 0n) continue;
        used += share;

        const dest = Address.parse(h.owner.address);
        const body = buildJettonTransferBody(share, dest);

        const seqno = await walletContract.getSeqno();
        await walletContract.sendTransfer({
            seqno,
            secretKey: DISTRIBUTOR_WALLET_SECRET_KEY,
            messages: [
                internal({
                    to: rewardWalletAddr,
                    value: toNano('0.05'), // enough gas for JettonTransfer
                    bounce: true,
                    body,
                }),
            ],
        });

        console.log(`Sent ${share.toString()} reward tokens to ${dest.toString()}`);
    }

    console.log('Total used in distribution:', used.toString());
}

swapAndDistribute().catch((e) => {
    console.error(e);
    process.exit(1);
});
