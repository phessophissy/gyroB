import { expect } from "chai";
import hardhat from "hardhat";

const { ethers } = hardhat;
const parse = ethers.parseUnits;

describe("GyroBoard round lifecycle", function () {
  it("resets room state after round finalization", async function () {
    const [creator, ...players] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockUSDm")).deploy();
    const board = await (await ethers.getContractFactory("GyroBoard")).deploy(
      await token.getAddress(),
      creator.address,
    );

    await board.createRoom(9, parse("2", 18));
    for (let i = 0; i < 5; i++) {
      await token.mint(players[i].address, parse("100", 18));
      await token.connect(players[i]).approve(await board.getAddress(), parse("2", 18));
      await board.connect(players[i]).play(9, (i % 5) + 1);
    }

    const room = await board.rooms(9);
    expect(room.currentRound).to.equal(2n);
    expect(room.playerCount).to.equal(0n);
    expect(room.totalPot).to.equal(0n);
  });

  it("exposes getRoomIds after multiple room creations", async function () {
    const [creator] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockUSDm")).deploy();
    const board = await (await ethers.getContractFactory("GyroBoard")).deploy(
      await token.getAddress(),
      creator.address,
    );

    await board.createRoom(2, parse("5", 18));
    await board.createRoom(4, parse("10", 18));
    const ids = await board.getRoomIds();
    expect(ids.map(Number).sort()).to.deep.equal([2, 4]);
  });
});
