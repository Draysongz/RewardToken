import "./jettonwallet";
import "./messages";
import "./constants";
import "@stdlib/deploy";

struct JettonMinterStandardState {
    totalSupply: Int as coins;
    mintable: Bool;
    adminAddress: Address;
    jettonContent: Cell;
    jettonWalletCode: Cell;
}

contract JettonMinterStandard {
    totalSupply: Int as coins;
    owner: Address;
    jettonContent: Cell;
    mintable: Bool; 
    timeLapse: Int;
    dedustVaultAddress: Address;
    dedustRouterAddress: Address;
    poolAddress: Address;
    liquidityDepositAddress: Address;
    tokenDedustVaultAddress: Address;
    tokenPoolAddress: Address;
    tokenLiquidityDepositAddress: Address; 
    feeWallet: Address;
    buyTaxBps: Int;
    sellTaxBps: Int;


    updatedRequiredAddress: Bool;

    init(
        _totalSupply: Int as coins,
        _owner: Address,
        _jettonContent: Cell,
        _mintable: Bool, 
        _feeWallet: Address,
        _buyTaxBps: Int,
        _sellTaxBps: Int,
    ) {
        self.mintable = _mintable;
        self.totalSupply = _totalSupply;
        self.owner = _owner;
        self.jettonContent = _jettonContent;

        self.timeLapse = 0;

        self.dedustVaultAddress = emptyAddress();
        self.dedustRouterAddress = emptyAddress();
        self.poolAddress = emptyAddress();
        self.liquidityDepositAddress = emptyAddress();
        self.tokenDedustVaultAddress= emptyAddress();
        self.tokenLiquidityDepositAddress= emptyAddress();
        self.tokenPoolAddress = emptyAddress();

        self.feeWallet = _feeWallet;
        self.buyTaxBps = _buyTaxBps;
        self.sellTaxBps = _sellTaxBps;

        self.updatedRequiredAddress = false;
    }

    receive() {
        cashback(sender());
    }

   
    receive(msg: Mint) {
        require(self.updatedRequiredAddress, "required address must be updated before minting the tokens");
        require(sender() == self.owner, "Incorrect sender");
        require(self.mintable, "Mint is closed");

        let ctx = context();
        require(
            ctx.value >
            minTonsForStorage +
            msg.mintMessage.forwardTonAmount +
            ctx.readForwardFee() +
            2 * getComputeFee(gasForTransfer, false),
            "Insufficient gas for mint",
        );

        self.totalSupply += msg.mintMessage.amount;

        deploy(DeployParameters {
            value: 0, 
            bounce: true,
            mode: SendRemainingValue | SendBounceIfActionFail,
            body: msg.mintMessage.toCell(),
            init: getJettonWalletInit(
                msg.receiver,
                self.timeLapse,
                self.owner,
                self.dedustVaultAddress,
                self.dedustRouterAddress,
                self.poolAddress,
                self.liquidityDepositAddress,
                self.tokenDedustVaultAddress,
                self.tokenLiquidityDepositAddress,
                self.tokenPoolAddress,
                self.feeWallet,
                self.buyTaxBps,
                self.sellTaxBps,
            ),
        });
    }

    receive(msg: ProvideWalletAddress) {
        let ownerWorkchain: Int = parseStdAddress(msg.ownerAddress.asSlice()).workchain;

        let targetJettonWallet: BasechainAddress = (ownerWorkchain == Basechain)
            ? contractBasechainAddress(initOf JettonWallet(
                0,
                msg.ownerAddress,
                myAddress(),
                self.timeLapse,
                self.owner,
                self.dedustVaultAddress,
                self.dedustRouterAddress,
                self.poolAddress,
                self.liquidityDepositAddress,
                self.tokenDedustVaultAddress,
                self.tokenLiquidityDepositAddress,
                self.tokenPoolAddress,
                self.feeWallet,
                self.buyTaxBps,
                self.sellTaxBps,
            ))
            : emptyBasechainAddress();

        message(MessageParameters {
            body: makeTakeWalletAddressMsg(targetJettonWallet, msg),
            to: sender(),
            value: 0,
            mode: SendRemainingValue,
        });
    }

    receive(msg: JettonBurnNotification) {
        let sender = parseStdAddress(sender().asSlice());
        let wallet = getJettonBasechainWalletByOwner(
            msg.sender, 
            self.timeLapse, 
            self.owner, 
            self.dedustVaultAddress, 
            self.dedustRouterAddress, 
            self.poolAddress, 
            self.liquidityDepositAddress, 
            self.tokenDedustVaultAddress,
            self.tokenLiquidityDepositAddress,
            self.tokenPoolAddress, 
            self.feeWallet, 
            self.buyTaxBps, 
            self.sellTaxBps);

        require(sender.workchain == Basechain && sender.address == wallet.hash!!, "Unauthorized burn");

        self.totalSupply -= msg.amount;

        if (msg.responseDestination != null) {
            message(MessageParameters {
                to: msg.responseDestination!!,
                body: JettonExcesses { queryId: msg.queryId }.toCell(),
                value: 0,
                bounce: false,
                mode: SendRemainingValue | SendIgnoreErrors, 
            });
        }
    }

    receive(msg: JettonUpdateContent) {
        require(sender() == self.owner, "Incorrect sender");
        self.jettonContent = msg.content;
    }

    receive(msg: ChangeOwner) {
        require(sender() == self.owner, "Incorrect sender");
        self.owner = msg.newOwner;
    }

    receive(msg: CloseMinting) {
        require(sender() == self.owner, "Incorrect sender");
        self.mintable = false;
        cashback(sender());
    }

    receive(msg: ClaimTON) {
        require(sender() == self.owner, "Incorrect sender");
        nativeReserve(minTonsForStorage, ReserveExact | ReserveBounceIfActionFail);
    
        message(MessageParameters {
            bounce: true,
            to: msg.receiver,
            value: 0,
            mode: SendRemainingBalance,
        });
    }

    receive(msg: UpdateRequiredAddresses) {
        require(!self.updatedRequiredAddress, "required addressed already updated");
        self.dedustRouterAddress = msg.dedustRouterAddress;
        self.dedustVaultAddress = msg.dedustVaultAddress;
        self.poolAddress = msg.poolAddress;
        self.liquidityDepositAddress = msg.liquidityDepositAddress;
        self.tokenDedustVaultAddress = msg.tokenDedustVaultAddress;
        self.tokenLiquidityDepositAddress = msg.tokenLiquidityDepositAddress;
        self.tokenPoolAddress = msg.tokenPoolAddress;
        self.updatedRequiredAddress = true;
    }

    bounced(msg: bounced<JettonTransferInternal>) {
        self.totalSupply -= msg.amount;
    }

    get fun get_jetton_data(): JettonMinterStandardState {
        return JettonMinterStandardState {
            totalSupply: self.totalSupply,
            mintable: self.mintable,
            adminAddress: self.owner,
            jettonContent: self.jettonContent,
            jettonWalletCode: codeOf JettonWallet,
        };
    }

    get fun get_wallet_address(ownerAddress: Address): Address {
        return getJettonWalletByOwner(
            ownerAddress,
            self.timeLapse,
            self.owner,
            self.dedustVaultAddress,
            self.dedustRouterAddress,
            self.poolAddress,
            self.liquidityDepositAddress,
            self.tokenDedustVaultAddress,
            self.tokenLiquidityDepositAddress,
            self.tokenPoolAddress,
            self.feeWallet,
            self.buyTaxBps,
            self.sellTaxBps,
        );
    }

    get fun get_time_lapse(): Int {
        return self.timeLapse;
    }
}

asm fun emptyAddress(): Address { b{00} PUSHSLICE }

inline fun makeTakeWalletAddressMsg(targetJettonWallet: BasechainAddress, msg: ProvideWalletAddress): Cell {
    return beginCell()
        .storeUint(TakeWalletAddressOpcode, 32)
        .storeUint(msg.queryId, 64)
        .storeBasechainAddress(targetJettonWallet)
        .storeMaybeRef(msg.includeAddress ? beginCell().storeAddress(msg.ownerAddress).endCell() : null)
        .endCell();
}

inline fun getJettonWalletInit(
    address: Address,
    timeLapse: Int,
    minterOwner: Address,
    dedustVaultAddress: Address,
    dedustRouterAddress: Address,
    poolAddress: Address,
    liquidityDepositAddress: Address,
    tokenDedustVaultAddress: Address,
    tokenLiquidityDepositAddress: Address,
    tokenPoolAddress: Address,
    feeWallet: Address,
    buyTaxBps: Int,
    sellTaxBps: Int,
): StateInit {
    return initOf JettonWallet(
        0,
        address,
        myAddress(),
        timeLapse,
        minterOwner,
        dedustVaultAddress,
        dedustRouterAddress,
        poolAddress,
        liquidityDepositAddress,
        tokenDedustVaultAddress,
        tokenLiquidityDepositAddress,
        tokenPoolAddress,
        feeWallet,
        buyTaxBps,
        sellTaxBps,
    );
}

inline fun getJettonWalletByOwner(
    jettonWalletOwner: Address,
    timeLapse: Int,
    minterOwner: Address,
    dedustVaultAddress: Address,
    dedustRouterAddress: Address,
    poolAddress: Address,
    liquidityDepositAddress: Address,
    tokenDedustVaultAddress: Address,
    tokenLiquidityDepositAddress: Address,
    tokenPoolAddress: Address,
    feeWallet: Address,
    buyTaxBps: Int,
    sellTaxBps: Int,
): Address {
    return contractAddress(getJettonWalletInit(
        jettonWalletOwner,
        timeLapse,
        minterOwner,
        dedustVaultAddress,
        dedustRouterAddress,
        poolAddress,
        liquidityDepositAddress,
        tokenDedustVaultAddress,
        tokenLiquidityDepositAddress,
        tokenPoolAddress,
        feeWallet,
        buyTaxBps,
        sellTaxBps,
    ));
}

inline fun getJettonBasechainWalletByOwner(
    jettonWalletOwner: Address,
    timeLapse: Int,
    minterOwner: Address,
    dedustVaultAddress: Address,
    dedustRouterAddress: Address,
    poolAddress: Address,
    liquidityDepositAddress: Address,
    tokenDedustVaultAddress: Address,
    tokenLiquidityDepositAddress: Address,
    tokenPoolAddress: Address,
    feeWallet: Address,
    buyTaxBps: Int,
    sellTaxBps: Int,
): BasechainAddress {
    return contractBasechainAddress(getJettonWalletInit(
        jettonWalletOwner,
        timeLapse,
        minterOwner,
        dedustVaultAddress,
        dedustRouterAddress,
        poolAddress,
        liquidityDepositAddress,
        tokenDedustVaultAddress,
        tokenLiquidityDepositAddress,
        tokenPoolAddress,
        feeWallet,
        buyTaxBps,
        sellTaxBps,
    ));



}
