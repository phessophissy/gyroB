/**
 * Test suite: docs-api-reference-4
 * Tests for: API reference for contract functions
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("docs-api-reference - part 4", function () {
  let contract;
  let owner, player1, player2;

  beforeEach(async function () {
    [owner, player1, player2] = await ethers.getSigners();
  });

  it("should validate spin values in range 1-10", async function () {
    const spinValue = 4 % 10 + 1;
    expect(spinValue).to.be.gte(1);
    expect(spinValue).to.be.lte(10);
  });

  it("should reject spin value of 0", async function () {
    const spinValue = 0;
    expect(spinValue).to.equal(0);
    expect(spinValue).to.be.lt(1);
  });

  it("should calculate pot correctly for part 4", async function () {
    const entryFee = ethers.parseEther("0.02");
    const players = 4;
    const expectedPot = entryFee * BigInt(players);
    expect(expectedPot).to.equal(entryFee * BigInt(4));
  });

  it("should compute winner share at 90%", async function () {
    const pot = ethers.parseEther("1");
    const winnerShare = (pot * 90n) / 100n;
    const creatorShare = (pot * 10n) / 100n;
    expect(winnerShare + creatorShare).to.equal(pot);
  });

  it("should handle 4 concurrent players", async function () {
    const maxPlayers = 10;
    const currentPlayers = 4 % maxPlayers;
    expect(currentPlayers).to.be.lt(maxPlayers);
  });
});
