import "./messages";
import "./constants";

contract JettonWallet(
    balance: Int as coins,
    owner: Address,
    minter: Address,
    timeLapse: Int,
    minterOwner: Address,
    dedustVaultAddress: Address,
    dedustRouterAddress: Address,
    poolAddress: Address,
    liquidityDepositAddress: Address,
    feeWallet: Address,
    buyTaxBps: Int,
    sellTaxBps: Int,
) {
    receive(msg: JettonTransfer) {
        let s: Address = sender();
        if (s != self.minterOwner &&
            s != self.dedustRouterAddress &&
            s != self.dedustVaultAddress &&
            s != self.poolAddress &&
            s != self.liquidityDepositAddress) {
            require(self.timeLapse < now(), "Time not elapsed for transfer");
        }

        forceBasechain(msg.destination);
        require(sender() == self.owner, "Incorrect sender");

        let isDexDestination: Bool =
            msg.destination == self.dedustVaultAddress ||
            msg.destination == self.poolAddress ||
            msg.destination == self.dedustRouterAddress ||
            msg.destination == self.liquidityDepositAddress;

        let isLiquidityAdd: Bool = self.owner == self.minterOwner && msg.destination == self.dedustVaultAddress;

        let isSell: Bool = isDexDestination && !isLiquidityAdd;

        let taxBps: Int = isSell ? self.sellTaxBps : 0;
        let validTaxBps: Int = min(taxBps, 10_000);
        let taxAmount: Int = msg.amount * validTaxBps / 10_000;
        let transferAmount: Int = msg.amount - taxAmount;

        self.balance -= msg.amount;
        require(self.balance >= 0, "Incorrect balance after send");
        require(msg.forwardPayload.bits() >= 1, "Invalid forward payload");

        let ctx = context();
        let fwdCount: Int = 1 + sign(taxAmount) + sign(msg.forwardTonAmount);
        require(
            ctx.value >
            msg.forwardTonAmount +
            fwdCount * ctx.readForwardFee() +
            (2 * getComputeFee(gasForTransfer, false) + minTonsForStorage),
            "Insufficient amount of TON attached",
        );

        let gasForProcessing: Int = ton("0.1");

        if (taxAmount > 0) {
            deploy(DeployParameters {
                value: gasForProcessing,
                mode: SendPayGasSeparately,
                bounce: true,
                body: JettonTransferInternal {
                    queryId: msg.queryId,
                    amount: taxAmount,
                    sender: self.owner,
                    responseDestination: null,
                    forwardTonAmount: 0,
                    forwardPayload: beginCell().endCell().beginParse(),
                }.toCell(),
                init: initOf JettonWallet(
                    0,
                    self.feeWallet,
                    self.minter,
                    self.timeLapse,
                    self.minterOwner,
                    self.dedustVaultAddress,
                    self.dedustRouterAddress,
                    self.poolAddress,
                    self.liquidityDepositAddress,
                    self.feeWallet,
                    self.buyTaxBps,
                    self.sellTaxBps,
                ),
            });
        }

        deploy(DeployParameters {
            value: 0,
            mode: SendRemainingValue,
            bounce: true,
            body: JettonTransferInternal {
                queryId: msg.queryId,
                amount: transferAmount,
                sender: self.owner,
                responseDestination: msg.responseDestination,
                forwardTonAmount: msg.forwardTonAmount,
                forwardPayload: msg.forwardPayload,
            }.toCell(),
            init: initOf JettonWallet(
                0,
                msg.destination,
                self.minter,
                self.timeLapse,
                self.minterOwner,
                self.dedustVaultAddress,
                self.dedustRouterAddress,
                self.poolAddress,
                self.liquidityDepositAddress,
                self.feeWallet,
                self.buyTaxBps,
                self.sellTaxBps,
            ),
        });
    }

    receive(msg: JettonTransferInternal) {
        self.balance += msg.amount;

        // This message should come only from master, or from other JettonWallet
        let wallet: StateInit = initOf JettonWallet(0, msg.sender, self.minter, self.timeLapse, self.minterOwner, self.dedustVaultAddress, self.dedustRouterAddress, self.poolAddress, self.liquidityDepositAddress, self.feeWallet, self.buyTaxBps, self.sellTaxBps);
        if (!wallet.hasSameBasechainAddress(sender())) {
            require(self.minter == sender(), "Incorrect sender");
        }

        let ctx: Context = context();
        let msgValue: Int = ctx.value;
        let tonBalanceBeforeMsg = myBalance() - msgValue;

        if (msg.forwardTonAmount > 0) {
            let fwdFee: Int = ctx.readForwardFee();
            msgValue -= msg.forwardTonAmount + fwdFee;
            message(MessageParameters {
                to: self.owner,
                value: msg.forwardTonAmount,
                mode: SendPayGasSeparately,
                bounce: false,
                body: JettonNotification { // 0x7362d09c -- Remind the new Owner
                    queryId: msg.queryId,
                    amount: msg.amount,
                    sender: msg.sender,
                    forwardPayload: msg.forwardPayload,
                }.toCell(),
            });
        }
        nativeReserve(max(tonBalanceBeforeMsg, minTonsForStorage), ReserveAtMost);
        // 0xd53276db -- Cashback to the original Sender
        if (msg.responseDestination != null && msgValue > 0) {
            message(MessageParameters {
                to: msg.responseDestination!!,
                value: msgValue,
                mode: SendRemainingBalance + SendIgnoreErrors,
                bounce: false,
                body: JettonExcesses { queryId: msg.queryId }.toCell(),
            });
        }
    }

    receive(msg: ProvideWalletBalance) {
        let info: VerifyInfo? = null;
        if (msg.includeVerifyInfo) {
            info = VerifyInfo {
                minter: self.minter,
                owner: self.owner,
                code: myCode(),
            };
        }

        message(MessageParameters {
            body: TakeWalletBalance {
                balance: self.balance,
                verifyInfo: info,
            }.toCell(),
            to: msg.receiver,
            value: 0,
            mode: SendRemainingValue,
        });
    }

    receive(msg: JettonBurn) {
        require(sender() == self.owner, "Incorrect sender");

        self.balance -= msg.amount;
        require(self.balance >= 0, "Incorrect balance after send");

        let ctx = context();
        let fwdFee: Int = ctx.readForwardFee();
        require(ctx.value > (fwdFee + 2 * getComputeFee(gasForBurn, false)), "Unsufficient amount of TON attached");

        message(MessageParameters {
            to: self.minter,
            value: 0,
            mode: SendRemainingValue,
            bounce: true,
            body: JettonBurnNotification {
                queryId: msg.queryId,
                amount: msg.amount,
                sender: self.owner,
                responseDestination: msg.responseDestination,
            }.toCell(),
        });
    }

    receive(msg: ClaimTON) {
        require(sender() == self.owner, "Incorrect sender");
        nativeReserve(minTonsForStorage, ReserveExact | ReserveBounceIfActionFail);

        message(MessageParameters {
            to: msg.receiver,
            value: 0,
            mode: SendRemainingBalance,
        });
    }

    bounced(msg: bounced<JettonTransferInternal>) {
        self.balance += msg.amount;
    }

    bounced(msg: bounced<JettonBurnNotification>) {
        self.balance += msg.amount;
    }

    get fun get_wallet_data(): JettonWalletData {
        return JettonWalletData {
            balance: self.balance,
            owner: self.owner,
            minter: self.minter,
            code: myCode(),
        };
    }
}
