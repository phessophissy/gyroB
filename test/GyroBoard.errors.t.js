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
});