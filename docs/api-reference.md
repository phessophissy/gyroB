# API Reference

Complete reference for the GyroBoard smart contract and the frontend
helper modules.

---

## Smart Contract — `GyroBoard`

[`contracts/GyroBoard.sol`](../contracts/GyroBoard.sol)

A deterministic spin-to-win game on Celo using USDm (Mento Dollar).
Players join rooms by paying an entry fee, choose a spin value between
1 and 10, and compete in 10-player rounds. The round auto-finalizes
when the tenth player joins, distributing 90 % of the pot to the
highest-spin winner(s) and 10 % to the game creator.

### Constants

| Constant | Type | Value | Description |
|----------|------|-------|-------------|
| `MIN_SPIN` | `uint256` | `1` | Lowest valid spin value. |
| `MAX_SPIN` | `uint256` | `10` | Highest valid spin value. |
| `MAX_PLAYERS` | `uint256` | `10` | Players required to finalize a round. |
| `WINNER_SHARE` | `uint256` | `90` | % of the pot paid to winners. |
| `CREATOR_SHARE` | `uint256` | `10` | % of the pot paid to the creator. |
| `MIN_ENTRY_FEE` | `uint256` | `0.02 ether` | Minimum room entry fee (0.02 USDm). |
| `MAX_ENTRY_FEE` | `uint256` | `100 ether` | Maximum room entry fee (100 USDm). |

### Immutables

| Immutable | Type | Description |
|-----------|------|-------------|
| `mentoDollar` | `IERC20` | The USDm token used for fees and payouts. |
| `creator` | `address` | Recipient of the 10 % creator share. |

### Structs

#### `Room`

| Field | Type | Description |
|-------|------|-------------|
| `entryFee` | `uint256` | USDm each player pays to join a round. |
| `currentRound` | `uint256` | Monotonically increasing round counter (starts at 1). |
| `playerCount` | `uint256` | Players joined in the current round (0–10). |
| `totalPot` | `uint256` | Accumulated entry fees for the current round. |
| `highestSpin` | `uint256` | Largest spin submitted so far this round. |
| `exists` | `bool` | Whether the room has been created. |

#### `Player`

| Field | Type | Description |
|-------|------|-------------|
| `player` | `address` | Wallet address of the participant. |
| `spin` | `uint256` | Chosen spin value (`MIN_SPIN..MAX_SPIN`). |

### Storage Mappings

| Mapping | Key Path | Value | Description |
|---------|----------|-------|-------------|
| `rooms` | `uint256 roomId` | `Room` | Lookup table of all rooms. |
| `playerSpins` | `roomId → round → address` | `uint256` | Spin value a player submitted. |
| `hasPlayed` | `roomId → round → address` | `bool` | Whether a player already joined a round. |
| `roundPlayers` | `roomId → round → index` | `Player` | Ordered list of players in a round. |

### Errors

| Error | Triggered when |
|-------|----------------|
| `RoomAlreadyExists()` | Creating a room with an existing ID. |
| `RoomDoesNotExist()` | Interacting with an uncreated roomId. |
| `InvalidEntryFee()` | Entry fee outside `[MIN_ENTRY_FEE, MAX_ENTRY_FEE]`. |
| `RoundFull()` | Joining a round that already has `MAX_PLAYERS`. |
| `InvalidSpin()` | Spin outside `[MIN_SPIN, MAX_SPIN]`. |
| `AlreadyPlayed()` | A player joins the same room+round twice. |
| `NoWinners()` | Finalization finds no matching highest spin (unreachable). |

### Events

#### `RoomCreated(uint256 roomId, uint256 entryFee)`
Emitted when a new room is created.

#### `Played(address indexed player, uint256 roomId, uint256 round, uint256 spin)`
Emitted each time a player submits a spin.

#### `RoundCompleted(uint256 roomId, uint256 round, uint256 highestSpin, uint256 winnerCount)`
Emitted when a round auto-finalizes after the tenth player.

#### `Payout(address indexed recipient, uint256 amount, uint256 roomId)`
Emitted for each payout transfer (winners and creator).

### Functions

#### `constructor(address usdMToken, address creatorAddress)`

Initializes the game with the USDm token and creator payout address.
Reverts if either address is `address(0)`.

#### `createRoom(uint256 roomId, uint256 entryFee) external`

Creates a new game room with a fixed entry fee. The room ID is
caller-chosen and must be unique. The entry fee must be within
`[MIN_ENTRY_FEE, MAX_ENTRY_FEE]`. The room starts at round 1.

| Reverts | Condition |
|---------|-----------|
| `RoomAlreadyExists()` | `rooms[roomId].exists` is true. |
| `InvalidEntryFee()` | Fee outside the allowed range. |

Emits `RoomCreated`.

#### `play(uint256 roomId, uint256 spin) external nonReentrant`

Submit a spin to an active room for the current round. Transfers the
entry fee from the caller via `safeTransferFrom`, records the spin,
and auto-finalizes the round when the tenth player joins.

| Reverts | Condition |
|---------|-----------|
| `RoomDoesNotExist()` | Room has not been created. |
| `RoundFull()` | `playerCount >= MAX_PLAYERS`. |
| `InvalidSpin()` | Spin outside `[MIN_SPIN, MAX_SPIN]`. |
| `AlreadyPlayed()` | Caller already joined this round. |

Emits `Played`, and `RoundCompleted` + `Payout`(s) on finalization.

#### `getRoomIds() external view returns (uint256[] memory)`

Returns the list of all room IDs that have been created.

#### `getRoundPlayers(uint256 roomId, uint256 round) external view returns (Player[] memory players)`

Returns the player list for a specific round. For the current
(in-progress) round only `playerCount` entries are returned; for
completed rounds all `MAX_PLAYERS` entries are returned. Reverts with
`RoomDoesNotExist()` if the room does not exist.
