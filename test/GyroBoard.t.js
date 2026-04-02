import { expect } from "chai";
import hardhat from "hardhat";

const { ethers } = hardhat;

const parse = ethers.parseUnits;

describe("GyroBoard", function () {
  async function deployFixture() {
    const [creator, opener, ...players] = await ethers.getSigners();
    const mockFactory = await ethers.getContractFactory("MockCUSD");
    const token = await mockFactory.deploy();
    await token.waitForDeployment();

    const boardFactory = await ethers.getContractFactory("GyroBoard");
    const board = await boardFactory.deploy(await token.getAddress(), creator.address);
    await board.waitForDeployment();

    return { creator, opener, players, token, board };
  }

  async function seedPlayers(token, signers, amount = parse("500", 18)) {
    for (const signer of signers) {
      await token.mint(signer.address, amount);
    }
  }

  async function approveAndPlay(board, token, signer, roomId, spin) {
    const room = await board.rooms(roomId);
    await token.connect(signer).approve(await board.getAddress(), room.entryFee);
    await board.connect(signer).play(roomId, spin);
  }

  it("creates rooms with valid cUSD entry fees", async function () {
    const { board } = await deployFixture();

    await expect(board.createRoom(1, parse("0.02", 18)))
      .to.emit(board, "RoomCreated")
      .withArgs(1, parse("0.02", 18));

    const room = await board.rooms(1);
    expect(room.exists).to.equal(true);
    expect(room.currentRound).to.equal(1n);

    await expect(board.createRoom(1, parse("5", 18))).to.be.revertedWithCustomError(board, "RoomAlreadyExists");
    await expect(board.createRoom(2, parse("0.019", 18))).to.be.revertedWithCustomError(board, "InvalidEntryFee");
    await expect(board.createRoom(3, parse("101", 18))).to.be.revertedWithCustomError(board, "InvalidEntryFee");
  });

  it("enforces room existence, spin range, and one play per round", async function () {
    const { board, token, players } = await deployFixture();
    await board.createRoom(7, parse("5", 18));
    await seedPlayers(token, players.slice(0, 2));

    await expect(board.connect(players[0]).play(7, 4)).to.be.reverted;
    await expect(board.connect(players[0]).play(999, 4)).to.be.revertedWithCustomError(board, "RoomDoesNotExist");

    await token.connect(players[0]).approve(await board.getAddress(), parse("5", 18));
    await expect(board.connect(players[0]).play(7, 0)).to.be.revertedWithCustomError(board, "InvalidSpin");
    await expect(board.connect(players[0]).play(7, 11)).to.be.revertedWithCustomError(board, "InvalidSpin");

    await board.connect(players[0]).play(7, 5);
    await token.connect(players[0]).approve(await board.getAddress(), parse("5", 18));
    await expect(board.connect(players[0]).play(7, 6)).to.be.revertedWithCustomError(board, "AlreadyPlayed");
  });

  it("auto-finalizes on the tenth player and pays 10 percent to creator with 90 percent split across winners", async function () {
    const { creator, board, token, players } = await deployFixture();
    const entryFee = parse("10", 18);
    const roomId = 4;

    await board.createRoom(roomId, entryFee);
    await seedPlayers(token, players.slice(0, 10), parse("1000", 18));

    const spins = [3, 10, 4, 10, 1, 7, 6, 8, 2, 10];
    const creatorStart = await token.balanceOf(creator.address);
    const winnerStart = await token.balanceOf(players[1].address);

    for (let i = 0; i < spins.length; i++) {
      await token.connect(players[i]).approve(await board.getAddress(), entryFee);
      if (i < spins.length - 1) {
        await expect(board.connect(players[i]).play(roomId, spins[i]))
          .to.emit(board, "Played")
          .withArgs(players[i].address, roomId, 1, spins[i]);
      } else {
        await expect(board.connect(players[i]).play(roomId, spins[i]))
          .to.emit(board, "RoundCompleted")
          .withArgs(roomId, 1, 10, 3);
      }
    }

    const totalPot = entryFee * 10n;
    const creatorAmount = (totalPot * 10n) / 100n;
    const winnerPool = (totalPot * 90n) / 100n;
    const payoutPerWinner = winnerPool / 3n;

    expect(await token.balanceOf(creator.address)).to.equal(creatorStart + creatorAmount);
    expect(await token.balanceOf(players[1].address)).to.equal(winnerStart - entryFee + payoutPerWinner);
    expect(await token.balanceOf(players[3].address)).to.equal(parse("1000", 18) - entryFee + payoutPerWinner);
    expect(await token.balanceOf(players[9].address)).to.equal(parse("1000", 18) - entryFee + payoutPerWinner);

    const room = await board.rooms(roomId);
    expect(room.currentRound).to.equal(2n);
    expect(room.playerCount).to.equal(0n);
    expect(room.totalPot).to.equal(0n);
    expect(room.highestSpin).to.equal(0n);
  });

  it("keeps rooms isolated while separate rounds progress at different entry tiers", async function () {
    const { board, token, players } = await deployFixture();
    await board.createRoom(1, parse("0.02", 18));
    await board.createRoom(2, parse("5", 18));
    await seedPlayers(token, players.slice(0, 12));

    for (let i = 0; i < 4; i++) {
      await approveAndPlay(board, token, players[i], 1, i + 1);
    }

    for (let i = 4; i < 9; i++) {
      await approveAndPlay(board, token, players[i], 2, 10 - i);
    }

    const lowTier = await board.rooms(1);
    const midTier = await board.rooms(2);

    expect(lowTier.playerCount).to.equal(4n);
    expect(lowTier.totalPot).to.equal(parse("0.08", 18));
    expect(lowTier.highestSpin).to.equal(4n);

    expect(midTier.playerCount).to.equal(5n);
    expect(midTier.totalPot).to.equal(parse("25", 18));
    expect(midTier.highestSpin).to.equal(6n);

    expect(await board.hasPlayed(1, 1, players[0].address)).to.equal(true);
    expect(await board.hasPlayed(2, 1, players[0].address)).to.equal(false);
  });

  it("supports 100 plus wallets across multiple rooms without shared state bottlenecks", async function () {
    const [creator, roomOpener] = await ethers.getSigners();
    const walletFactory = Array.from({ length: 110 }, () => ethers.Wallet.createRandom().connect(ethers.provider));

    const mockFactory = await ethers.getContractFactory("MockCUSD");
    const token = await mockFactory.deploy();
    await token.waitForDeployment();

    const boardFactory = await ethers.getContractFactory("GyroBoard");
    const board = await boardFactory.deploy(await token.getAddress(), creator.address);
    await board.waitForDeployment();

    for (let roomId = 1; roomId <= 11; roomId++) {
      await board.connect(roomOpener).createRoom(roomId, parse(String(roomId), 18));
    }

    for (const wallet of walletFactory) {
      await creator.sendTransaction({ to: wallet.address, value: parse("1", 18) });
      await token.mint(wallet.address, parse("1000", 18));
    }

    for (let i = 0; i < walletFactory.length; i++) {
      const roomId = Math.floor(i / 10) + 1;
      const wallet = walletFactory[i];
      const fee = (await board.rooms(roomId)).entryFee;
      await token.connect(wallet).approve(await board.getAddress(), fee);
      await board.connect(wallet).play(roomId, (i % 10) + 1);
    }

    for (let roomId = 1; roomId <= 11; roomId++) {
      const room = await board.rooms(roomId);
      expect(room.currentRound).to.equal(2n);
      expect(room.playerCount).to.equal(0n);
      expect(room.totalPot).to.equal(0n);
      expect(room.highestSpin).to.equal(0n);
    }
  });
});
