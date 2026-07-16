import { expect } from "chai";
import hardhat from "hardhat";
import { deployBoardFixture, mintAndApprove, parse } from "./helpers.js";

const { ethers } = hardhat;

// Constants mirrored from the contract (see contracts/GyroBoard.sol).
const MAX_PLAYERS = 10n;
const WINNER_SHARE = 90n;
const CREATOR_SHARE = 10n;

describe("GyroBoard payout finalization", function () {
  it("pays the full 90 percent to a single winner and drains the contract", async function () {
    const { creator, players, token, board } = await deployBoardFixture();
    const entryFee = parse("0.02", 18); // 0.02 USDm — the contract minimum
    const roomId = 1;

    await board.createRoom(roomId, entryFee);
    await mintAndApprove(token, board, players.slice(0, 10), parse("1000", 18));

    // Only the last player submits the highest spin (10) → exactly one winner.
    const spins = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (let i = 0; i < spins.length; i++) {
      await board.connect(players[i]).play(roomId, spins[i]);
    }

    const totalPot = entryFee * 10n;
    const creatorAmount = (totalPot * CREATOR_SHARE) / 100n;
    const winnerPool = (totalPot * WINNER_SHARE) / 100n; // 1 winner → full pool
    const winner = players[9];

    expect(await token.balanceOf(creator.address)).to.equal(
      creatorAmount, // creator started at 0
    );
    expect(await token.balanceOf(winner.address)).to.equal(
      parse("1000", 18) - entryFee + winnerPool,
    );

    // Single winner with an exactly divisible pool → contract fully drained.
    expect(await token.balanceOf(await board.getAddress())).to.equal(0n);

    const room = await board.rooms(roomId);
    expect(room.currentRound).to.equal(2n);
    expect(room.playerCount).to.equal(0n);
    expect(room.totalPot).to.equal(0n);
    expect(room.highestSpin).to.equal(0n);
  });

  it("keeps integer-division dust in the contract balance on a 7-way tie", async function () {
    const { creator, players, token, board } = await deployBoardFixture();
    const entryFee = parse("0.02", 18); // 0.02 USDm
    const roomId = 2;

    await board.createRoom(roomId, entryFee);
    await mintAndApprove(token, board, players.slice(0, 10), parse("1000", 18));

    // 7 players tie at the highest spin (10); 3 players submit a lower spin (5).
    // With 7 winners, winnerPool (1.8e17) is NOT divisible by 7 → dust remains.
    const spins = [10, 10, 10, 5, 10, 10, 10, 5, 5, 10];
    for (let i = 0; i < spins.length; i++) {
      await board.connect(players[i]).play(roomId, spins[i]);
    }

    const totalPot = entryFee * 10n; // 0.2 USDm = 2e17
    const creatorAmount = (totalPot * CREATOR_SHARE) / 100n; // 2e16
    const winnerPool = (totalPot * WINNER_SHARE) / 100n; // 1.8e17
    const winnerCount = 7n;
    const payoutPerWinner = winnerPool / winnerCount; // floor division
    const dust = winnerPool - payoutPerWinner * winnerCount;

    // 1.8e17 mod 7 == 2 wei — the documented integer-division remainder.
    expect(dust).to.equal(2n);

    expect(await token.balanceOf(creator.address)).to.equal(creatorAmount);
    for (let i = 0; i < 10; i++) {
      const bal = await token.balanceOf(players[i].address);
      if (spins[i] === 10) {
        expect(bal).to.equal(parse("1000", 18) - entryFee + payoutPerWinner);
      } else {
        expect(bal).to.equal(parse("1000", 18) - entryFee);
      }
    }

    // Remainder stays in the contract balance (per SECURITY.md / README design).
    expect(await token.balanceOf(await board.getAddress())).to.equal(dust);
  });

  it("finalizes two rooms concurrently with independent pots and state resets", async function () {
    const { creator, players, token, board } = await deployBoardFixture();
    const lowFee = parse("0.02", 18); // room A — 0.02 USDm
    const highFee = parse("5", 18); // room B — 5 USDm
    const roomA = 1;
    const roomB = 2;

    await board.createRoom(roomA, lowFee);
    await board.createRoom(roomB, highFee);
    // A single large mint+approval covers both rooms' entry fees for every player.
    await mintAndApprove(token, board, players.slice(0, 10), parse("1000", 18));

    // Interleave plays across both rooms so finalization is truly concurrent.
    for (let i = 0; i < 10; i++) {
      await board.connect(players[i]).play(roomA, i + 1); // player 9 wins room A
      await board.connect(players[i]).play(roomB, 10 - i); // player 0 wins room B
    }

    const creatorStartBalance = 0n; // creator started at 0
    const creatorTotal =
      (lowFee * 10n * CREATOR_SHARE) / 100n + // room A creator share (2e16)
      (highFee * 10n * CREATOR_SHARE) / 100n; // room B creator share (5e16)

    expect(await token.balanceOf(creator.address)).to.equal(creatorTotal);

    // Room A: winner is player 9 (spin 10), sole winner of the low-tier pot.
    const winnerAPool = (lowFee * 10n * WINNER_SHARE) / 100n;
    expect(await token.balanceOf(players[9].address)).to.equal(
      parse("1000", 18) - lowFee - highFee + winnerAPool,
    );

    // Room B: winner is player 0 (spin 10), sole winner of the high-tier pot.
    const winnerBPool = (highFee * 10n * WINNER_SHARE) / 100n;
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

    // Both pots were fully drained (single winners, exactly divisible pools).
    expect(await token.balanceOf(await board.getAddress())).to.equal(0n);
    expect(MAX_PLAYERS).to.equal(10n); // sanity anchor
  });
});
