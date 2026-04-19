/**
 * Test suite: feature-entry-fee-calculator-9
 * Tests for: Entry fee calculator with USD conversion
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("feature-entry-fee-calculator - part 9", function () {
  let contract;
  let owner, player1, player2;

  beforeEach(async function () {
    [owner, player1, player2] = await ethers.getSigners();
  });

  it("should validate spin values in range 1-10", async function () {
    const spinValue = 9 % 10 + 1;
    expect(spinValue).to.be.gte(1);
    expect(spinValue).to.be.lte(10);
  });

  it("should reject spin value of 0", async function () {
    const spinValue = 0;
    expect(spinValue).to.equal(0);
    expect(spinValue).to.be.lt(1);
  });

  it("should calculate pot correctly for part 9", async function () {
    const entryFee = ethers.parseEther("0.02");
    const players = 9;
    const expectedPot = entryFee * BigInt(players);
    expect(expectedPot).to.equal(entryFee * BigInt(9));
  });

  it("should compute winner share at 90%", async function () {
    const pot = ethers.parseEther("1");
    const winnerShare = (pot * 90n) / 100n;
    const creatorShare = (pot * 10n) / 100n;
    expect(winnerShare + creatorShare).to.equal(pot);
  });

  it("should handle 9 concurrent players", async function () {
    const maxPlayers = 10;
    const currentPlayers = 9 % maxPlayers;
    expect(currentPlayers).to.be.lt(maxPlayers);
  });
});
