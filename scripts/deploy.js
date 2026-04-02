import { ethers } from "hardhat";

const CUSD_MAINNET = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const DEFAULT_ROOMS = [
  { roomId: 1n, entryFee: ethers.parseUnits("0.02", 18) },
  { roomId: 2n, entryFee: ethers.parseUnits("5", 18) },
  { roomId: 3n, entryFee: ethers.parseUnits("10", 18) },
  { roomId: 4n, entryFee: ethers.parseUnits("100", 18) },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const creator = process.env.GYROB_CREATOR || deployer.address;
  const boardFactory = await ethers.getContractFactory("GyroBoard");
  const board = await boardFactory.deploy(CUSD_MAINNET, creator);
  await board.waitForDeployment();

  console.log("GyroBoard deployed:", await board.getAddress());
  console.log("Creator:", creator);
  console.log("cUSD:", CUSD_MAINNET);

  for (const room of DEFAULT_ROOMS) {
    const tx = await board.createRoom(room.roomId, room.entryFee);
    await tx.wait();
    console.log(`Room ${room.roomId} created with fee ${ethers.formatUnits(room.entryFee, 18)} cUSD`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
