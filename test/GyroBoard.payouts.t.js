import { expect } from "chai";
import hardhat from "hardhat";
import { deployBoardFixture, mintAndApprove, parse } from "./helpers.js";

const { ethers } = hardhat;

// Constants mirrored from the contract (see contracts/GyroBoard.sol).
const MAX_PLAYERS = 5n;
const WINNER_SHARE = 90n;
const TREASURY_SHARE = 10n;

describe("GyroBoard payout finalization", function () {
  it("pays the full 90 percent to a single winner and credits 10 percent to the treasury", async function () {
    const { creator, players, token, board } = await deployBoardFixture();
    const entryFee = parse("0.02", 18); // 0.02 USDm — the contract minimum
    const roomId = 1;

    await board.createRoom(roomId, entryFee);
    await mintAndApprove(token, board, players.slice(0, 5), parse("1000", 18));

    // Only the last player submits the highest spin (10) → exactly one winner.
    const spins = [1, 2, 3, 4, 10];
    for (let i = 0; i < spins.length; i++) {
      await board.connect(players[i]).play(roomId, spins[i]);
    }

    const totalPot = entryFee * 5n;
    const treasuryAmount = (totalPot * TREASURY_SHARE) / 100n;
    const winnerPool = (totalPot * WINNER_SHARE) / 100n; // 1 winner → full pool
    const winner = players[4];

    // The 10 % treasury cut is retained by the contract (credited to treasuryBalance).
    expect(await board.treasuryBalance()).to.equal(treasuryAmount);
    expect(await token.balanceOf(winner.address)).to.equal(
      parse("1000", 18) - entryFee + winnerPool,
    );

    // Single winner with an exactly divisible pool → contract holds only the treasury cut.
    expect(await token.balanceOf(await board.getAddress())).to.equal(treasuryAmount);

    const room = await board.rooms(roomId);
    expect(room.currentRound).to.equal(2n);
    expect(room.playerCount).to.equal(0n);
    expect(room.totalPot).to.equal(0n);
    expect(room.highestSpin).to.equal(0n);
  });

  it("keeps integer-division dust in the contract balance on a 3-way tie", async function () {
    const { creator, players, token, board } = await deployBoardFixture();
    const entryFee = parse("0.02", 18); // 0.02 USDm
    const roomId = 2;

    await board.createRoom(roomId, entryFee);
    await mintAndApprove(token, board, players.slice(0, 5), parse("1000", 18));

    // 3 players tie at the highest spin (10); 2 players submit a lower spin (5).
    const spins = [10, 10, 10, 5, 5];
    for (let i = 0; i < spins.length; i++) {
      await board.connect(players[i]).play(roomId, spins[i]);
    }

    const totalPot = entryFee * 5n; // 0.1 USDm = 1e17
    const treasuryAmount = (totalPot * TREASURY_SHARE) / 100n; // 1e16
    const winnerPool = (totalPot * WINNER_SHARE) / 100n; // 9e16
    const winnerCount = 3n;
    const payoutPerWinner = winnerPool / winnerCount; // floor division
    const dust = winnerPool - payoutPerWinner * winnerCount;

    expect(await board.treasuryBalance()).to.equal(treasuryAmount);
    for (let i = 0; i < 5; i++) {
      const bal = await token.balanceOf(players[i].address);
      if (spins[i] === 10) {
        expect(bal).to.equal(parse("1000", 18) - entryFee + payoutPerWinner);
      } else {
        expect(bal).to.equal(parse("1000", 18) - entryFee);
      }
    }

    // Contract holds treasury cut + integer-division dust.
    expect(await token.balanceOf(await board.getAddress())).to.equal(treasuryAmount + dust);
  });

  it("finalizes two rooms concurrently with independent pots and state resets", async function () {
    const { creator, players, token, board } = await deployBoardFixture();
    const lowFee = parse("0.02", 18); // room A — 0.02 USDm
    const highFee = parse("5", 18); // room B — 5 USDm
    const roomA = 1;
    const roomB = 2;

    await board.createRoom(roomA, lowFee);
    await board.createRoom(roomB, highFee);
    await mintAndApprove(token, board, players.slice(0, 5), parse("1000", 18));

    // Interleave plays across both rooms so finalization is truly concurrent.
    for (let i = 0; i < 5; i++) {
      await board.connect(players[i]).play(roomA, i + 1); // player 4 wins room A
      await board.connect(players[i]).play(roomB, 5 - i); // player 0 wins room B
    }

    const treasuryTotal =
      (lowFee * 5n * TREASURY_SHARE) / 100n + // room A treasury share
      (highFee * 5n * TREASURY_SHARE) / 100n; // room B treasury share

    expect(await board.treasuryBalance()).to.equal(treasuryTotal);

    // Room A: winner is player 4 (spin 5), sole winner of the low-tier pot.
    const winnerAPool = (lowFee * 5n * WINNER_SHARE) / 100n;
    expect(await token.balanceOf(players[4].address)).to.equal(
      parse("1000", 18) - lowFee - highFee + winnerAPool,
    );

    // Room B: winner is player 0 (spin 5), sole winner of the high-tier pot.
    const winnerBPool = (highFee * 5n * WINNER_SHARE) / 100n;
    expect(await token.balanceOf(players[0].address)).to.equal(
      parse("1000", 18) - lowFee - highFee + winnerBPool,
    );

    // Both rooms independently reset for the next round.
    for (const id of [roomA, roomB]) {
      const room = await board.rooms(id);
      expect(room.currentRound).to.equal(2n);
      expect(room.playerCount).to.equal(0n);
      expect(room.totalPot).to.equal(0n);
      expect(room.highestSpin).to.equal(0n);
    }

    // Contract holds only the combined treasury cut (single winners, divisible pools).
    expect(await token.balanceOf(await board.getAddress())).to.equal(treasuryTotal);
    expect(MAX_PLAYERS).to.equal(5n); // sanity anchor
  });
});
