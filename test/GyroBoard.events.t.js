import { expect } from "chai";
import hardhat from "hardhat";

const { ethers } = hardhat;
const parse = ethers.parseUnits;

describe("GyroBoard events", function () {
  async function deployFixture() {
    const [creator, ...players] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockUSDm")).deploy();
    await token.waitForDeployment();
    const board = await (await ethers.getContractFactory("GyroBoard")).deploy(
      await token.getAddress(),
      creator.address,
    );
    await board.waitForDeployment();
    return { creator, players, token, board };
  }

  it("emits RoomCreated when a room is created", async function () {
    const { board } = await deployFixture();
    await expect(board.createRoom(1, parse("5", 18)))
      .to.emit(board, "RoomCreated")
      .withArgs(1, parse("5", 18));
  });

  it("emits Payout events on round completion", async function () {
    const { creator, board, token, players } = await deployFixture();
    await board.createRoom(1, parse("1", 18));
    for (const p of players.slice(0, 10)) {
      await token.mint(p.address, parse("100", 18));
      await token.connect(p).approve(await board.getAddress(), parse("1", 18));
      await board.connect(p).play(1, 5);
    }
    const filter = board.filters.Payout(creator.address);
    const events = await board.queryFilter(filter);
    expect(events.length).to.be.gte(1);
  });
});