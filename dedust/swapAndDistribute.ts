import { Address, toNano, beginCell, SendMode } from '@ton/core';
import { TonClient4, WalletContractV5R1, internal } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { JettonRoot } from '@dedust/sdk';
import { minterAddress } from '../utils';
import fs from 'fs';

const PROGRESS_FILE = './distribution-progress.json';
const BATCH_SIZE = 6;
const BATCH_DELAY_MS = 2000;

function loadProgress(): number {
    if (!fs.existsSync(PROGRESS_FILE)) return 0;
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')).lastIndex ?? 0;
}

function saveProgress(index: number) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastIndex: index }, null, 2));
}

async function waitForRewardFunding(
    client: TonClient4,
    distributorAddress: Address,
    intervalMs = 15000,
): Promise<bigint> {
    while (true) {
        const balance = await fetchRewardWalletBalance(client, distributorAddress);

        if (balance > 0n) {
            console.log(`✅ Reward wallet funded: ${balance.toString()}`);
            return balance;
        }

        console.log('⏳ Reward wallet empty. Fund the wallet to continue...');
        await new Promise((r) => setTimeout(r, intervalMs));
    }
}

const TONCENTER_BASE = 'https://toncenter.com/api/v3';

// Replace with your mnemonic phrase (12 or 24 words)
const MNEMONIC =
    'transfer mouse detail quarter social large mountain ceiling lumber divorce scan lend purpose left zebra holiday ancient since glow hobby jump pact rocket pigeon'.split(
        ' ',
    );
const DISTRIBUTOR_WALLET_WORKCHAIN = 0; // usually 0

const JETTON_MINTER = minterAddress;

const REWARD_JETTON_MINTER = Address.parse('EQA1R_LuQCLHlMgOo1S4G7Y7W1cd0FrAkbA10Zq7rddKxi9k');

// This will be calculated from the distributor wallet address
let REWARD_JETTON_WALLET: Address;

const TON_ENDPOINT = 'https://mainnet-v4.tonhubapi.com';

async function fetchHolders(limit: number = 1000) {
    // Use toncenter.com API
    const jettonAddress = JETTON_MINTER.toString({ urlSafe: true, bounceable: true });
    const url = `${TONCENTER_BASE}/jetton/wallets?jetton_address=${jettonAddress}`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to fetch holders: ${res.status} ${await res.text()}`);
        }
        const data = await res.json();

        // Parse toncenter.com response structure
        const wallets = (data.jetton_wallets ?? [])
            .map((item: any) => ({
                address: item.address,
                balance: item.balance,
                owner: { address: item.owner },
            }))
            .filter((w: any) => w.address && BigInt(w.balance) > 0n) as {
            address: string;
            balance: string;
            owner: { address: string };
        }[];

        console.log(`Found ${wallets.length} holders`);
        console.log(JSON.stringify(wallets, null, 2));
        return wallets;
    } catch (error) {
        console.error('Error fetching holders:', error);
        throw error;
    }
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

async function fetchRewardWalletBalance(client: TonClient4, distributorAddress: Address): Promise<bigint> {
    try {
        // Try to get balance directly from blockchain first
        const rewardJettonRoot = client.open(JettonRoot.createFromAddress(REWARD_JETTON_MINTER));
        const rewardJettonWalletAddress = await rewardJettonRoot.getWalletAddress(distributorAddress);
        const rewardJettonWallet = client.open(await rewardJettonRoot.getWallet(distributorAddress));

        // Check if wallet is deployed by getting account state
        const lastBlock = await client.getLastBlock();
        const account = await client.getAccount(lastBlock.last.seqno, rewardJettonWalletAddress);
        console.log(account);

        if (account.account.state.type === 'active') {
            const balance = await rewardJettonWallet.getBalance();
            console.log(`✅ Found reward wallet on-chain. Balance: ${balance.toString()}`);
            return balance;
        } else {
            console.log('⚠️  Reward wallet not initialized yet (state: inactive)');
            return 0n;
        }
    } catch (error) {
        console.log('⚠️  Error getting balance from blockchain, trying API...');
        console.log('Error:', error);
    }

    // Fallback to API
    try {
        const jettonAddress = REWARD_JETTON_MINTER.toString({ urlSafe: true, bounceable: true });
        const ownerAddress = distributorAddress.toString({ urlSafe: true, bounceable: false });
        const url = `${TONCENTER_BASE}/jetton/wallets?jetton_address=${jettonAddress}`;

        console.log(`🔍 Searching for reward wallet via API...`);
        console.log(`   Looking for owner: ${ownerAddress}`);
        console.log(`   Reward jetton minter: ${jettonAddress}`);

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to fetch reward wallet balance: ${res.status} ${await res.text()}`);
        }
        const data = await res.json();

        console.log(`📊 API returned ${(data.jetton_wallets ?? []).length} wallets`);

        // Find wallet with matching owner address
        const wallet = (data.jetton_wallets ?? []).find((w: any) => {
            const wOwner = (w.owner || '').toLowerCase();
            const targetOwner = ownerAddress.toLowerCase();
            const match = wOwner === targetOwner;
            if (!match && (data.jetton_wallets ?? []).length < 10) {
                console.log(`   Checking wallet owner: ${w.owner} (match: ${match})`);
            }
            return match;
        });

        if (!wallet) {
            console.log('❌ Reward wallet not found in API response');
            console.log('   This might mean:');
            console.log("   1. The wallet hasn't been initialized yet (no transactions)");
            console.log("   2. The address format doesn't match");
            console.log('   3. The wallet has 0 balance');
            return 0n;
        }

        const balance = BigInt(wallet.balance);
        console.log(`✅ Found reward wallet via API. Balance: ${balance.toString()}`);
        return balance;
    } catch (error) {
        console.error('❌ Error fetching reward wallet balance from API:', error);
        return 0n;
    }
}

async function distributeRewards() {
    const keyPair = await mnemonicToWalletKey(MNEMONIC);
    const client = new TonClient4({ endpoint: TON_ENDPOINT });

    const distributorWallet = WalletContractV5R1.create({
        workchain: DISTRIBUTOR_WALLET_WORKCHAIN,
        publicKey: keyPair.publicKey,
    });

    const walletContract = client.open(distributorWallet);
    const distributorAddress = distributorWallet.address;

    console.log('📱 Distributor wallet:', distributorAddress.toString());

    // Resolve reward jetton wallet
    const rewardMinter = client.open(JettonRoot.createFromAddress(REWARD_JETTON_MINTER));
    const rewardWalletAddr = await rewardMinter.getWalletAddress(distributorAddress);

    console.log('🎁 Reward jetton wallet:', rewardWalletAddr.toString());

    // 1️⃣ Check reward balance FIRST
    const totalReward = await waitForRewardFunding(client, distributorAddress)

    if (totalReward === 0n) {
        console.log('⏳ No rewards available yet.');
        return;
    }

    // 2️⃣ Fetch holders
    const holders = await fetchHolders();
    const validHolders = holders.filter(h => BigInt(h.balance) > 0n);

    if (validHolders.length === 0) {
        console.log('❌ No holders with balance.');
        return;
    }

    const totalBalance = validHolders.reduce(
        (acc, h) => acc + BigInt(h.balance),
        0n,
    );

    console.log(`👥 Holders: ${validHolders.length}`);
    console.log(`📊 Total holder balance: ${totalBalance.toString()}`);
    console.log(`💰 Total reward to distribute: ${totalReward.toString()}`);

    // 3️⃣ Build transfers
    const transfers: {
        dest: Address;
        share: bigint;
        body: any;
    }[] = [];

    let allocated = 0n;

    for (const h of validHolders) {
        const share = (BigInt(h.balance) * totalReward) / totalBalance;
        if (share === 0n) continue;

        const dest = Address.parse(h.owner.address);
        transfers.push({
            dest,
            share,
            body: buildJettonTransferBody(share, dest),
        });

        allocated += share;
    }

    // Remainder → first holder
    const remainder = totalReward - allocated;
    if (remainder > 0n && transfers.length > 0) {
        transfers[0].share += remainder;
        transfers[0].body = buildJettonTransferBody(
            transfers[0].share,
            transfers[0].dest,
        );
    }

    console.log(`📦 Prepared ${transfers.length} transfers`);

    // 4️⃣ Progress logic (NOW it is legal)
    const lastIndex = loadProgress();

    if (lastIndex >= transfers.length) {
        console.log('🔄 New funding cycle detected. Resetting progress.');
        saveProgress(0);
    }

    let startIndex = loadProgress();
    console.log(`🔁 Resuming from index ${startIndex}`);

    // 5️⃣ Batch sending
    for (let i = startIndex; i < transfers.length; i += BATCH_SIZE) {
        const batch = transfers.slice(i, i + BATCH_SIZE);
        const seqno = await walletContract.getSeqno();

        console.log(`🚀 Sending batch ${i} → ${i + batch.length}`);

        await walletContract.sendTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            messages: batch.map(({ body }) =>
                internal({
                    to: rewardWalletAddr,
                    value: toNano('0.06'),
                    bounce: true,
                    body,
                }),
            ),
        });

        // Save progress ONLY after success
        saveProgress(i + batch.length);

        for (const { dest, share } of batch) {
            console.log(`  ✅ ${share.toString()} → ${dest.toString()}`);
        }

        if (i + BATCH_SIZE < transfers.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
    }

    console.log('🎉 Distribution cycle complete.');
}


async function runContinuousDistribution() {
    console.log('🟢 Starting continuous reward distributor…');

    while (true) {
        try {
            await distributeRewards();
            console.log('🕒 Waiting for next reward funding cycle…');
        } catch (err) {
            console.error('🔥 Distribution error:', err);
        }

        // Sleep before checking again
        await new Promise((r) => setTimeout(r, 20000));
    }
}

runContinuousDistribution().catch((e) => {
    console.error(e);
    process.exit(1);
});
