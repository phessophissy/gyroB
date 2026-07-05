export const gyrobAbi = [
  {
    type: "function",
    name: "rooms",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "entryFee", type: "uint256" },
      { name: "currentRound", type: "uint256" },
      { name: "playerCount", type: "uint256" },
      { name: "totalPot", type: "uint256" },
      { name: "highestSpin", type: "uint256" },
      { name: "exists", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getRoomIds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "getRoundPlayers",
    stateMutability: "view",
    inputs: [
      { name: "roomId", type: "uint256" },
      { name: "round", type: "uint256" },
    ],
    outputs: [
      {
        name: "players",
        type: "tuple[]",
        components: [
          { name: "player", type: "address" },
          { name: "spin", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "hasPlayed",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "play",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roomId", type: "uint256" },
      { name: "spin", type: "uint256" },
    ],
    outputs: [],
  },
];