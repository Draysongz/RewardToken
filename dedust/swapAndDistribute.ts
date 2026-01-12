import { Address, toNano, beginCell, SendMode } from '@ton/core';
import { TonClient4, WalletContractV5R1, internal } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { JettonRoot } from '@dedust/sdk';
import { minterAddress } from '../utils';

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
    // Derive key pair from mnemonic
    const keyPair = await mnemonicToWalletKey(MNEMONIC);

    const client = new TonClient4({ endpoint: TON_ENDPOINT });

    // Calculate distributor wallet address
    const distributorWallet = WalletContractV5R1.create({
        workchain: DISTRIBUTOR_WALLET_WORKCHAIN,
        publicKey: keyPair.publicKey,
    });
    const distributorAddress = distributorWallet.address;

    // Get wallet balance from blockchain
    const lastBlock = await client.getLastBlock();
    const account = await client.getAccount(lastBlock.last.seqno, distributorAddress);
    const balance = account.account.balance;

    // Log wallet info after importing from mnemonic
    console.log('═══════════════════════════════════════════════════════');
    console.log('📱 Wallet imported from mnemonic phrase');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Wallet Address:', distributorAddress.toString());
    console.log('Balance:', (Number(balance) / 1e9).toFixed(4), 'TON');
    console.log('Balance (nanoTON):', balance.toString());
    console.log('═══════════════════════════════════════════════════════\n');

    // Get reward jetton wallet address
    const rewardMinter = client.open(JettonRoot.createFromAddress(REWARD_JETTON_MINTER));
    REWARD_JETTON_WALLET = await rewardMinter.getWalletAddress(distributorAddress);

    console.log('Distributor wallet:', distributorAddress.toString());
    console.log('Reward jetton wallet:', REWARD_JETTON_WALLET.toString());
    console.log('');

    // Fetch holders
    const holders = await fetchHolders();
    const totalBalance = holders.reduce((acc: bigint, h: { balance: string }) => acc + BigInt(h.balance), 0n);

    if (totalBalance === 0n) {
        console.log('No holders with balance; aborting distribution');
        return;
    }

    // Get reward token balance
    console.log('Checking reward token balance...');
    const totalReward = await fetchRewardWalletBalance(client, distributorAddress);
    if (totalReward === 0n) {
        console.log('');
        console.log('❌ No reward tokens available; aborting distribution');
        console.log('   Make sure you have reward tokens in your reward jetton wallet.');
        console.log(`   Reward jetton wallet address: ${REWARD_JETTON_WALLET.toString()}`);
        return;
    }
    console.log('');

    console.log('Total holders balance:', totalBalance.toString());
    console.log('Total reward to distribute:', totalReward.toString());
    console.log(`Number of holders: ${holders.length}`);
    console.log('');

    const walletContract = client.open(distributorWallet);
    const rewardWalletAddr = REWARD_JETTON_WALLET;

    // Prepare all transfers
    const transfers: Array<{ dest: Address; share: bigint; body: any }> = [];
    let used = 0n;
    let skipped = 0;

    console.log('Calculating rewards for each holder...');
    console.log('');

    // First pass: include ALL holders with non-zero balance (even if share would be 0)
    // We'll apply minimum guarantee strategy after
    const holderShares: Array<{ dest: Address; share: bigint; balance: bigint; body: any }> = [];

    for (let i = 0; i < holders.length; i++) {
        const h = holders[i];
        const bal = BigInt(h.balance);

        if (bal === 0n) {
            console.log(`  Holder ${i + 1}: ${h.owner.address} - Balance: 0 (skipped)`);
            skipped++;
            continue;
        }

        // Proportional share (floor) - but don't skip if 0, we'll handle with minimum guarantee
        const share = (bal * totalReward) / totalBalance;
        const dest = Address.parse(h.owner.address);

        console.log(
            `  Holder ${i + 1}: ${dest.toString()} - Balance: ${bal.toString()} - Initial Share: ${share.toString()}`,
        );

        // Include ALL holders with non-zero balance, even if share is 0
        // We'll apply minimum guarantee strategy to ensure everyone gets something
        holderShares.push({ dest, share, balance: bal, body: null }); // body will be set later
    }

    console.log('');
    console.log(`Share calculation summary:`);
    console.log(`  Total holders: ${holders.length}`);
    console.log(`  Holders with non-zero balance: ${holderShares.length}`);
    console.log(`  Skipped (0 balance): ${skipped}`);

    // Strategy: Ensure minimum 1 token per holder (if possible), then distribute remainder proportionally
    const minPerHolder = 1n;
    const totalNeededForMin = BigInt(holderShares.length) * minPerHolder;

    if (totalReward >= totalNeededForMin && holderShares.length > 0) {
        // We have enough to give everyone at least 1 token
        const remainingAfterMin = totalReward - totalNeededForMin;

        console.log(
            `  Strategy: Giving minimum ${minPerHolder.toString()} to each holder, then distributing ${remainingAfterMin.toString()} proportionally`,
        );

        // Reset shares and recalculate with minimum guarantee
        used = 0n;
        for (const holder of holderShares) {
            // Give minimum 1 token
            let share = minPerHolder;

            // Add proportional share of remainder
            if (remainingAfterMin > 0n) {
                const proportionalShare = (holder.balance * remainingAfterMin) / totalBalance;
                share += proportionalShare;
            }

            holder.share = share;
            used += share;
            console.log(
                `    ${holder.dest.toString()}: ${share.toString()} tokens (balance: ${holder.balance.toString()})`,
            );
        }

        // Distribute any final remainder to largest holder
        const finalRemainder = totalReward - used;
        if (finalRemainder > 0n && holderShares.length > 0) {
            const largestHolder = holderShares.reduce((prev, current) =>
                current.balance > prev.balance ? current : prev,
            );
            largestHolder.share += finalRemainder;
            used += finalRemainder;
            console.log(
                `  Adding final remainder ${finalRemainder.toString()} to largest holder: ${largestHolder.dest.toString()}`,
            );
        }
    } else {
        // Not enough tokens to give everyone 1, distribute proportionally
        console.log(
            `  Strategy: Not enough tokens for minimum guarantee (need ${totalNeededForMin.toString()}, have ${totalReward.toString()})`,
        );
        console.log(`  Distributing proportionally based on balance...`);

        used = 0n;
        for (const holder of holderShares) {
            const share = (holder.balance * totalReward) / totalBalance;
            holder.share = share;
            used += share;
            if (share > 0n) {
                console.log(
                    `    ${holder.dest.toString()}: ${share.toString()} tokens (balance: ${holder.balance.toString()})`,
                );
            }
        }

        // Distribute remainder to largest holder
        const remainder = totalReward - used;
        if (remainder > 0n && holderShares.length > 0) {
            const largestHolder = holderShares.reduce((prev, current) =>
                current.balance > prev.balance ? current : prev,
            );
            largestHolder.share += remainder;
            used += remainder;
            console.log(
                `  Adding remainder ${remainder.toString()} to largest holder: ${largestHolder.dest.toString()}`,
            );
        }
    }

    console.log(`  Total reward allocated: ${used.toString()} / ${totalReward.toString()}`);

    console.log('');

    // Build transfer list from holderShares (only include holders with share > 0)
    for (const holder of holderShares) {
        if (holder.share === 0n) {
            console.log(`  Skipping ${holder.dest.toString()} - share is 0`);
            continue;
        }

        const body = buildJettonTransferBody(holder.share, holder.dest);
        transfers.push({ dest: holder.dest, share: holder.share, body });
    }

    console.log('');
    console.log(`Prepared ${transfers.length} transfers (skipped ${skipped} holders with 0 share)`);
    console.log(`Total reward to send: ${used.toString()}`);
    console.log('');

    if (transfers.length === 0) {
        console.log('No transfers to send');
        return;
    }

    // Send all transfers in batches (to avoid message size limits)
    // TON wallet can handle up to 4 messages per transaction, so we'll batch them
    const BATCH_SIZE = 4;
    let totalSent = 0;

    for (let i = 0; i < transfers.length; i += BATCH_SIZE) {
        const batch = transfers.slice(i, i + BATCH_SIZE);
        const seqno = await walletContract.getSeqno();

        console.log(`Sending batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} transfers)...`);

        await walletContract.sendTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            messages: batch.map(({ body }) =>
                internal({
                    to: rewardWalletAddr,
                    value: toNano('0.05'), // enough gas for JettonTransfer
                    bounce: true,
                    body,
                }),
            ),
        });

        // Log each transfer in the batch
        for (const { dest, share } of batch) {
            console.log(`  ✅ Sent ${share.toString()} reward tokens to ${dest.toString()}`);
            totalSent++;
        }

        // Wait a bit between batches to avoid rate limiting
        if (i + BATCH_SIZE < transfers.length) {
            console.log('  Waiting 2 seconds before next batch...');
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }

    console.log('');
    console.log(`✅ Distribution complete!`);
    console.log(`   Total transfers sent: ${totalSent}`);
    console.log(`   Total reward distributed: ${used.toString()}`);
}

distributeRewards().catch((e) => {
    console.error(e);
    process.exit(1);
});
