import { expect } from "chai";
import hardhat from "hardhat";
import { deployBoardFixture, mintAndApprove, parse } from "./helpers.js";

const { ethers } = hardhat;

const EARLY_FINALIZE_DELAY = 5n * 60n; // 5 minutes, matches contract constant

describe("GyroBoard early finalization", function () {
  it("reverts finalizeRoundEarly when fewer than 2 players have joined", async function () {
    const { players, token, board } = await deployBoardFixture();
    await board.createRoom(1, parse("1", 18));
    await mintAndApprove(token, board, players.slice(0, 1), parse("100", 18));

    await board.connect(players[0]).play(1, 5);

    await expect(board.finalizeRoundEarly(1))
      .to.be.revertedWithCustomError(board, "NotEnoughPlayers");
  });

  it("reverts finalizeRoundEarly before the delay has elapsed", async function () {
    const { players, token, board } = await deployBoardFixture();
    await board.createRoom(1, parse("1", 18));
    await mintAndApprove(token, board, players.slice(0, 2), parse("100", 18));

    await board.connect(players[0]).play(1, 3);
    await board.connect(players[1]).play(1, 7);

    await expect(board.finalizeRoundEarly(1))
      .to.be.revertedWithCustomError(board, "EarlyFinalizeTooSoon");
  });

  it("finalizes a 2-player round early after the delay and pays the winner 90%", async function () {
    const { players, token, board } = await deployBoardFixture();
    await board.createRoom(1, parse("1", 18));
    await mintAndApprove(token, board, players.slice(0, 2), parse("100", 18));

    await board.connect(players[0]).play(1, 3);
    await board.connect(players[1]).play(1, 7); // player 1 has the highest spin

    // Advance time past the early-finalize delay.
    await ethers.provider.send("evm_increaseTime", [Number(EARLY_FINALIZE_DELAY) + 1]);
    await ethers.provider.send("evm_mine", []);

    const winnerBefore = await token.balanceOf(players[1].address);
    await expect(board.finalizeRoundEarly(1))
      .to.emit(board, "RoundCompleted")
      .withArgs(1, 1, 7, 1);

    const totalPot = parse("1", 18) * 2n;
    const winnerPool = (totalPot * 90n) / 100n;
    expect(await token.balanceOf(players[1].address)).to.equal(winnerBefore + winnerPool);

    // Treasury credited with the 10% cut.
    expect(await board.treasuryBalance()).to.equal((totalPot * 10n) / 100n);

    const room = await board.rooms(1);
    expect(room.currentRound).to.equal(2n);
    expect(room.playerCount).to.equal(0n);
  });

  it("reverts finalizeRoundEarly for a non-existent room", async function () {
    const { board } = await deployBoardFixture();
    await expect(board.finalizeRoundEarly(999))
      .to.be.revertedWithCustomError(board, "RoomDoesNotExist");
  });
});
