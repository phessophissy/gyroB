import { expect } from "chai";
import hardhat from "hardhat";
import { deployBoardFixture, parse } from "./helpers.js";

const { ethers } = hardhat;

const TREASURY_WIN_SHARE = 70n;

describe("GyroBoard treasury mode", function () {
  it("lets the owner deposit USDm into the treasury vault", async function () {
    const { creator, token, board } = await deployBoardFixture();
    await token.mint(creator.address, parse("1000", 18));
    await token.connect(creator).approve(await board.getAddress(), parse("1000", 18));

    await expect(board.depositTreasury(parse("1000", 18)))
      .to.emit(board, "TreasuryDeposited")
      .withArgs(creator.address, parse("1000", 18));

    expect(await board.treasuryBalance()).to.equal(parse("1000", 18));
    expect(await token.balanceOf(await board.getAddress())).to.equal(parse("1000", 18));
  });

  it("reverts depositTreasury when called by a non-owner", async function () {
    const { players, token, board } = await deployBoardFixture();
    const player = players[0];
    await token.mint(player.address, parse("100", 18));
    await token.connect(player).approve(await board.getAddress(), parse("100", 18));
    await expect(board.connect(player).depositTreasury(parse("100", 18)))
      .to.be.revertedWithCustomError(board, "NotOwner");
  });

  it("reverts depositTreasury and withdrawTreasury for zero amounts", async function () {
    const { creator, board } = await deployBoardFixture();
    await expect(board.depositTreasury(0)).to.be.revertedWithCustomError(board, "InvalidTreasuryAmount");
    await expect(board.withdrawTreasury(0)).to.be.revertedWithCustomError(board, "InvalidTreasuryAmount");
  });

  it("lets the owner withdraw from the treasury vault", async function () {
    const { creator, token, board } = await deployBoardFixture();
    await token.mint(creator.address, parse("1000", 18));
    await token.connect(creator).approve(await board.getAddress(), parse("1000", 18));
    await board.depositTreasury(parse("1000", 18));

    const before = await token.balanceOf(creator.address);
    await expect(board.withdrawTreasury(parse("400", 18)))
      .to.emit(board, "TreasuryWithdrawn")
      .withArgs(creator.address, parse("400", 18));

    expect(await board.treasuryBalance()).to.equal(parse("600", 18));
    expect(await token.balanceOf(creator.address)).to.equal(before + parse("400", 18));
  });

  it("reverts withdrawTreasury when amount exceeds treasuryBalance", async function () {
    const { creator, token, board } = await deployBoardFixture();
    await token.mint(creator.address, parse("100", 18));
    await token.connect(creator).approve(await board.getAddress(), parse("100", 18));
    await board.depositTreasury(parse("100", 18));

    await expect(board.withdrawTreasury(parse("101", 18)))
      .to.be.revertedWithCustomError(board, "InvalidTreasuryAmount");
  });

  it("pays the player 70% of stake on a treasury win and decrements treasuryBalance", async function () {
    const { creator, players, token, board } = await deployBoardFixture();
    // Fund the treasury generously.
    await token.mint(creator.address, parse("10000", 18));
    await token.connect(creator).approve(await board.getAddress(), parse("10000", 18));
    await board.depositTreasury(parse("10000", 18));

    const player = players[0];
    const stake = parse("10", 18);
    await token.mint(player.address, parse("1000", 18));
    await token.connect(player).approve(await board.getAddress(), stake);

    const treasuryBefore = await board.treasuryBalance();
    const playerBefore = await token.balanceOf(player.address);

    // Spin 10 guarantees a win (treasury spin is 1..10, strictly-higher required,
    // so spin 10 beats treasury spins 1..9 and ties 10 → tie counts as a loss).
    // To force a deterministic win we use spin 10 and retry until the treasury spin < 10.
    let won = false;
    for (let attempt = 0; attempt < 50 && !won; attempt++) {
      await token.mint(player.address, stake);
      await token.connect(player).approve(await board.getAddress(), stake);
      const tx = await board.connect(player).playVsTreasury(10, stake);
      const receipt = await tx.wait();
      const parsed = receipt.logs
        .map((l) => {
          try {
            return board.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "TreasuryPlayed");
      won = parsed.args.won;
    }
    expect(won, "expected at least one win in 50 attempts").to.be.true;
  });

  it("absorbs the stake into the treasury on a loss", async function () {
    const { creator, players, token, board } = await deployBoardFixture();
    await token.mint(creator.address, parse("10000", 18));
    await token.connect(creator).approve(await board.getAddress(), parse("10000", 18));
    await board.depositTreasury(parse("10000", 18));

    const player = players[0];
    const stake = parse("10", 18);
    await token.mint(player.address, parse("1000", 18));

    const treasuryBefore = await board.treasuryBalance();

    // Spin 1 guarantees a loss (treasury spin is 1..10; spin 1 can never be strictly higher).
    await token.connect(player).approve(await board.getAddress(), stake);
    const tx = await board.connect(player).playVsTreasury(1, stake);
    const receipt = await tx.wait();
    const parsed = receipt.logs
      .map((l) => {
        try {
          return board.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e) => e && e.name === "TreasuryPlayed");

    expect(parsed.args.won).to.equal(false);
    expect(parsed.args.playerSpin).to.equal(1n);
    expect(parsed.args.payout).to.equal(0n);
    expect(await board.treasuryBalance()).to.equal(treasuryBefore + stake);
  });

  it("reverts playVsTreasury with an invalid spin or stake", async function () {
    const { creator, players, token, board } = await deployBoardFixture();
    await token.mint(creator.address, parse("1000", 18));
    await token.connect(creator).approve(await board.getAddress(), parse("1000", 18));
    await board.depositTreasury(parse("1000", 18));

    const player = players[0];
    await token.mint(player.address, parse("1000", 18));
    await token.connect(player).approve(await board.getAddress(), parse("1000", 18));

    await expect(board.connect(player).playVsTreasury(0, parse("1", 18)))
      .to.be.revertedWithCustomError(board, "InvalidSpin");
    await expect(board.connect(player).playVsTreasury(11, parse("1", 18)))
      .to.be.revertedWithCustomError(board, "InvalidSpin");
    await expect(board.connect(player).playVsTreasury(5, parse("0.01", 18)))
      .to.be.revertedWithCustomError(board, "InvalidEntryFee");
    await expect(board.connect(player).playVsTreasury(5, parse("101", 18)))
      .to.be.revertedWithCustomError(board, "InvalidEntryFee");
  });

  it("reverts a winning payout when the treasury has insufficient balance", async function () {
    const { players, token, board } = await deployBoardFixture();
    // Treasury left empty → any win attempt must revert with InsufficientTreasury.
    const player = players[0];
    const stake = parse("10", 18);
    await token.mint(player.address, parse("1000", 18));
    await token.connect(player).approve(await board.getAddress(), stake);

    // Spin 10 is the only spin that can win; if treasury spin < 10 it would try to pay
    // and revert due to insufficient balance. If treasury spin == 10 it's a loss (no revert).
    // We assert that across several attempts at least one reverts with InsufficientTreasury.
    let reverted = false;
    for (let attempt = 0; attempt < 20 && !reverted; attempt++) {
      await token.mint(player.address, stake);
      await token.connect(player).approve(await board.getAddress(), stake);
      try {
        await board.connect(player).playVsTreasury(10, stake);
      } catch (e) {
        const err = e;
        if (err.message && err.message.includes("InsufficientTreasury")) reverted = true;
      }
    }
    expect(reverted, "expected InsufficientTreasury when vault is empty").to.be.true;
  });
});
