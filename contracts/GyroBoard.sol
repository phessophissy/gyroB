// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title GyroBoard
/// @notice A deterministic spin-to-win game on Celo using USDm (Mento Dollar).
/// Players join rooms by paying an entry fee, choose a spin value between 1 and
/// 10, and compete in 10-player rounds. The round auto-finalizes when the tenth
/// player joins, distributing 90 % of the pot to the highest-spin winner(s) and
/// 10 % to the game creator.
/// @dev Uses OpenZeppelin ReentrancyGuard on the play function and SafeERC20 for
/// all token transfers. Room state is fully isolated by roomId and round number.
contract GyroBoard is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Lowest valid spin value a player may submit.
    uint256 public constant MIN_SPIN = 1;
    /// @notice Highest valid spin value a player may submit.
    uint256 public constant MAX_SPIN = 10;
    /// @notice Number of players required to fill a round and trigger finalization.
    uint256 public constant MAX_PLAYERS = 10;
    /// @notice Percentage of the pot distributed to winners (basis: 100).
    uint256 public constant WINNER_SHARE = 90;
    /// @notice Percentage of the pot sent to the game creator (basis: 100).
    uint256 public constant CREATOR_SHARE = 10;
    /// @notice Minimum entry fee a room can be created with (0.02 USDm).
    uint256 public constant MIN_ENTRY_FEE = 0.02 ether;
    /// @notice Maximum entry fee a room can be created with (100 USDm).
    uint256 public constant MAX_ENTRY_FEE = 100 ether;

    /// @notice The ERC-20 token used for entry fees and payouts (Mento Dollar on Celo).
    IERC20 public immutable mentoDollar;
    /// @notice Address that receives the creator share (CREATOR_SHARE %) of every pot.
    address public immutable creator;

    /// @notice Represents the configuration and live state of a game room.
    /// @param entryFee USDm amount each player must pay to join a round.
    /// @param currentRound Monotonically increasing round counter; starts at 1.
    /// @param playerCount Number of players who have joined the current round (0–10).
    /// @param totalPot Accumulated entry fees for the current round.
    /// @param highestSpin The largest spin value submitted so far this round.
    /// @param exists Whether the room has been created.
    struct Room {
        uint256 entryFee;
        uint256 currentRound;
        uint256 playerCount;
        uint256 totalPot;
        uint256 highestSpin;
        bool exists;
    }

    /// @notice A record of a single player's spin within a round.
    /// @param player The wallet address of the participant.
    /// @param spin The spin value chosen by this player (MIN_SPIN..MAX_SPIN).
    struct Player {
        address player;
        uint256 spin;
    }

    /// @notice Lookup table of all rooms keyed by roomId.
    mapping(uint256 => Room) public rooms;
    /// @notice Records the spin value a player submitted: roomId → round → player → spin.
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public playerSpins;
    /// @notice Tracks whether a player has already played in a given round: roomId → round → player → bool.
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasPlayed;
    /// @notice Ordered list of players in a round: roomId → round → index → Player.
    mapping(uint256 => mapping(uint256 => mapping(uint256 => Player))) public roundPlayers;

    /// @dev Internal array used to enumerate all created room IDs.
    uint256[] private roomIds;

    /// @notice Thrown when attempting to create a room with an ID that already exists.
    error RoomAlreadyExists();
    /// @notice Thrown when interacting with a roomId that has not been created.
    error RoomDoesNotExist();
    /// @notice Thrown when a room's entry fee is outside the MIN_ENTRY_FEE..MAX_ENTRY_FEE range.
    error InvalidEntryFee();
    /// @notice Thrown when a player tries to join a round that already has MAX_PLAYERS.
    error RoundFull();
    /// @notice Thrown when a spin value is outside the MIN_SPIN..MAX_SPIN range.
    error InvalidSpin();
    /// @notice Thrown when a player tries to play the same room and round twice.
    error AlreadyPlayed();
    /// @notice Thrown during finalization if no players matched the highest spin (should be unreachable).
    error NoWinners();

    /// @notice Emitted when a new room is created.
    /// @param roomId The unique identifier assigned to the room.
    /// @param entryFee The USDm entry fee for the room.
    event RoomCreated(uint256 roomId, uint256 entryFee);
    /// @notice Emitted each time a player submits a spin.
    /// @param player The address of the player.
    /// @param roomId The room the player joined.
    /// @param round The round number within that room.
    /// @param spin The spin value the player chose.
    event Played(address indexed player, uint256 roomId, uint256 round, uint256 spin);
    /// @notice Emitted when a round auto-finalizes after the tenth player.
    /// @param roomId The room whose round completed.
    /// @param round The round number that was finalized.
    /// @param highestSpin The winning spin value.
    /// @param winnerCount How many players shared the highest spin.
    event RoundCompleted(uint256 roomId, uint256 round, uint256 highestSpin, uint256 winnerCount);
    /// @notice Emitted for each payout transfer (winners and creator).
    /// @param recipient The address receiving USDm.
    /// @param amount The USDm amount transferred.
    /// @param roomId The room the payout originated from.
    event Payout(address indexed recipient, uint256 amount, uint256 roomId);

    constructor(address usdMToken, address creatorAddress) {
        require(usdMToken != address(0), "USDm token required");
        require(creatorAddress != address(0), "creator required");

        mentoDollar = IERC20(usdMToken);
        creator = creatorAddress;
    }

    function createRoom(uint256 roomId, uint256 entryFee) external {
        if (rooms[roomId].exists) revert RoomAlreadyExists();
        if (entryFee < MIN_ENTRY_FEE || entryFee > MAX_ENTRY_FEE) revert InvalidEntryFee();

        rooms[roomId] = Room({
            entryFee: entryFee,
            currentRound: 1,
            playerCount: 0,
            totalPot: 0,
            highestSpin: 0,
            exists: true
        });
        roomIds.push(roomId);

        emit RoomCreated(roomId, entryFee);
    }

    function play(uint256 roomId, uint256 spin) external nonReentrant {
        Room storage room = rooms[roomId];

        if (!room.exists) revert RoomDoesNotExist();
        if (room.playerCount >= MAX_PLAYERS) revert RoundFull();
        if (spin < MIN_SPIN || spin > MAX_SPIN) revert InvalidSpin();

        uint256 round = room.currentRound;
        if (hasPlayed[roomId][round][msg.sender]) revert AlreadyPlayed();

        mentoDollar.safeTransferFrom(msg.sender, address(this), room.entryFee);

        uint256 playerIndex = room.playerCount;
        playerSpins[roomId][round][msg.sender] = spin;
        hasPlayed[roomId][round][msg.sender] = true;
        roundPlayers[roomId][round][playerIndex] = Player({player: msg.sender, spin: spin});

        room.playerCount = playerIndex + 1;
        room.totalPot += room.entryFee;

        if (spin > room.highestSpin) {
            room.highestSpin = spin;
        }

        emit Played(msg.sender, roomId, round, spin);

        if (room.playerCount == MAX_PLAYERS) {
            _finalizeRound(roomId, round);
        }
    }

    function getRoomIds() external view returns (uint256[] memory) {
        return roomIds;
    }

    function getRoundPlayers(uint256 roomId, uint256 round) external view returns (Player[] memory players) {
        Room memory room = rooms[roomId];
        if (!room.exists) revert RoomDoesNotExist();

        uint256 count = round == room.currentRound ? room.playerCount : MAX_PLAYERS;
        players = new Player[](count);

        for (uint256 i = 0; i < count; i++) {
            players[i] = roundPlayers[roomId][round][i];
        }
    }

    function _finalizeRound(uint256 roomId, uint256 round) private {
        Room storage room = rooms[roomId];
        uint256 winnerCount = _countWinners(roomId, round, room.highestSpin);
        if (winnerCount == 0) revert NoWinners();

        uint256 creatorAmount = (room.totalPot * CREATOR_SHARE) / 100;
        uint256 winnerPool = (room.totalPot * WINNER_SHARE) / 100;
        uint256 payoutPerWinner = winnerPool / winnerCount;

        mentoDollar.safeTransfer(creator, creatorAmount);
        emit Payout(creator, creatorAmount, roomId);

        for (uint256 i = 0; i < MAX_PLAYERS; i++) {
            Player memory playerData = roundPlayers[roomId][round][i];
            if (playerData.spin == room.highestSpin) {
                mentoDollar.safeTransfer(playerData.player, payoutPerWinner);
                emit Payout(playerData.player, payoutPerWinner, roomId);
            }
        }

        emit RoundCompleted(roomId, round, room.highestSpin, winnerCount);

        room.currentRound = round + 1;
        room.playerCount = 0;
        room.totalPot = 0;
        room.highestSpin = 0;
    }

    function _countWinners(uint256 roomId, uint256 round, uint256 targetSpin) private view returns (uint256 count) {
        for (uint256 i = 0; i < MAX_PLAYERS; i++) {
            if (roundPlayers[roomId][round][i].spin == targetSpin) {
                count += 1;
            }
        }
    }
}
