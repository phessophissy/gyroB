// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract GyroBoard is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_SPIN = 1;
    uint256 public constant MAX_SPIN = 10;
    uint256 public constant MAX_PLAYERS = 10;
    uint256 public constant WINNER_SHARE = 90;
    uint256 public constant CREATOR_SHARE = 10;
    uint256 public constant MIN_ENTRY_FEE = 0.02 ether;
    uint256 public constant MAX_ENTRY_FEE = 100 ether;

    IERC20 public immutable mentoDollar;
    address public immutable creator;

    struct Room {
        uint256 entryFee;
        uint256 currentRound;
        uint256 playerCount;
        uint256 totalPot;
        uint256 highestSpin;
        bool exists;
    }

    struct Player {
        address player;
        uint256 spin;
    }

    mapping(uint256 => Room) public rooms;
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public playerSpins;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasPlayed;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => Player))) public roundPlayers;

    uint256[] private roomIds;

    error RoomAlreadyExists();
    error RoomDoesNotExist();
    error InvalidEntryFee();
    error RoundFull();
    error InvalidSpin();
    error AlreadyPlayed();
    error NoWinners();

    event RoomCreated(uint256 roomId, uint256 entryFee);
    event Played(address indexed player, uint256 roomId, uint256 round, uint256 spin);
    event RoundCompleted(uint256 roomId, uint256 round, uint256 highestSpin, uint256 winnerCount);
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
