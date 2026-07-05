import hardhat from "hardhat";

const { ethers } = hardhat;

export const parse = ethers.parseUnits;

export async function deployBoardFixture() {
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

export async function mintAndApprove(token, board, signers, amount) {
  const boardAddress = await board.getAddress();
  for (const signer of signers) {
    await token.mint(signer.address, amount);
    await token.connect(signer).approve(boardAddress, amount);
  }
}