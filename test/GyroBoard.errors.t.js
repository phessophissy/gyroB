import { expect } from "chai";
import hardhat from "hardhat";

const { ethers } = hardhat;
const parse = ethers.parseUnits;

describe("GyroBoard error cases", function () {
  it("reverts AlreadyPlayed when the same wallet plays twice in one round", async function () {
    const [creator, player] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockUSDm")).deploy();
    const board = await (await ethers.getContractFactory("GyroBoard")).deploy(
      await token.getAddress(),
      creator.address,
    );

    await board.createRoom(3, parse("1", 18));
    await token.mint(player.address, parse("50", 18));
    await token.connect(player).approve(await board.getAddress(), parse("1", 18));
    await board.connect(player).play(3, 5);

    await expect(board.connect(player).play(3, 6)).to.be.revertedWithCustomError(board, "AlreadyPlayed");
  });

  it("auto-finalizes at 5 players and starts a fresh round for the next player", async function () {
    const [creator, ...players] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockUSDm")).deploy();
    const board = await (await ethers.getContractFactory("GyroBoard")).deploy(
      await token.getAddress(),
      creator.address,
    );

    await board.createRoom(7, parse("1", 18));
    for (let i = 0; i < 5; i++) {
      await token.mint(players[i].address, parse("50", 18));
      await token.connect(players[i]).approve(await board.getAddress(), parse("1", 18));
      await board.connect(players[i]).play(7, i + 1);
    }

    // The 5th player auto-finalized round 1; the room is now on round 2 with 0 players.
    const room = await board.rooms(7);
    expect(room.currentRound).to.equal(2n);
    expect(room.playerCount).to.equal(0n);

    // A 6th wallet joins the fresh round 2 (no RoundFull, since the round reset).
    await token.mint(players[5].address, parse("50", 18));
    await token.connect(players[5]).approve(await board.getAddress(), parse("1", 18));
    await board.connect(players[5]).play(7, 6);
    expect((await board.rooms(7)).playerCount).to.equal(1n);
  });
});
