import { expect } from "chai";
import hardhat from "hardhat";

const { ethers } = hardhat;
const parse = ethers.parseUnits;

describe("GyroBoard error cases", function () {
  it("reverts RoundFull when eleventh player joins", async function () {
    const [creator, ...players] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockUSDm")).deploy();
    const board = await (await ethers.getContractFactory("GyroBoard")).deploy(
      await token.getAddress(),
      creator.address,
    );

    await board.createRoom(3, parse("1", 18));
    for (let i = 0; i < 10; i++) {
      await token.mint(players[i].address, parse("50", 18));
      await token.connect(players[i]).approve(await board.getAddress(), parse("1", 18));
      await board.connect(players[i]).play(3, 1);
    }

    await token.mint(players[10].address, parse("50", 18));
    await token.connect(players[10]).approve(await board.getAddress(), parse("1", 18));
    await expect(board.connect(players[10]).play(3, 2)).to.be.revertedWithCustomError(board, "RoundFull");
  });
});