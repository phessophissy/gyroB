// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title GyroBoard
/// @notice A spin-to-win game on Celo using USDm (Mento Dollar) with two modes:
///   1. Player-vs-Treasury: a single player spins against the in-game vault. The
///      player wins 70 % of their stake if their spin is strictly higher than the
///      treasury's random spin; otherwise they lose their full stake to the vault.
///   2. Player-vs-Player: 2 to 5 players join a room round, each spinning 1-10.
///      When the round fills (5th player) or is finalized early (after a delay
///      with at least 2 players), the highest-spin winner(s) take 90 % of the pot
///      and 10 % goes to the treasury vault.
/// @dev Uses OpenZeppelin ReentrancyGuard on mutating entry points and SafeERC20
///      for all token transfers. Room state is isolated by roomId and round.
contract GyroBoard is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice Lowest valid spin value a player may submit.
    uint256 public constant MIN_SPIN = 1;
    /// @notice Highest valid spin value a player may submit.
    uint256 public constant MAX_SPIN = 10;
    /// @notice Maximum number of players in a PvP round (auto-finalizes when reached).
    uint256 public constant MAX_PLAYERS = 5;
    /// @notice Minimum number of players required before a PvP round can be finalized early.
    uint256 public constant MIN_PLAYERS = 2;
    /// @notice Percentage of the PvP pot distributed to winners (basis: 100).
    uint256 public constant WINNER_SHARE = 90;
    /// @notice Percentage of the PvP pot sent to the treasury vault (basis: 100).
    uint256 public constant TREASURY_SHARE = 10;
    /// @notice Percentage of a winning stake paid to a player in treasury mode (basis: 100).
    uint256 public constant TREASURY_WIN_SHARE = 70;
    /// @notice Minimum stake/entry fee (0.02 USDm).
    uint256 public constant MIN_ENTRY_FEE = 0.02 ether;
    /// @notice Maximum stake/entry fee (100 USDm).
    uint256 public constant MAX_ENTRY_FEE = 100 ether;
    /// @notice Seconds that must elapse after the 2nd player joins before a round can be finalized early.
    uint256 public constant EARLY_FINALIZE_DELAY = 5 minutes;

    // ---------------------------------------------------------------------
    // Immutables
    // ---------------------------------------------------------------------

    /// @notice The ERC-20 token used for stakes and payouts (Mento Dollar on Celo).
    IERC20 public immutable mentoDollar;
    /// @notice Owner of the contract: may deposit/withdraw treasury funds.
    address public immutable owner;

    // ---------------------------------------------------------------------
    // Structs
    // ---------------------------------------------------------------------

    /// @notice Represents the configuration and live state of a PvP game room.
    /// @param entryFee USDm amount each player pays to join a round.
    /// @param currentRound Monotonically increasing round counter; starts at 1.
    /// @param playerCount Number of players who joined the current round (0..MAX_PLAYERS).
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

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice Lookup table of all PvP rooms keyed by roomId.
    mapping(uint256 => Room) public rooms;
    /// @notice Records the spin value a player submitted: roomId -> round -> player -> spin.
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public playerSpins;
    /// @notice Tracks whether a player has already played in a given round: roomId -> round -> player -> bool.
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasPlayed;
    /// @notice Ordered list of players in a round: roomId -> round -> index -> Player.
    mapping(uint256 => mapping(uint256 => mapping(uint256 => Player))) public roundPlayers;
    /// @notice Timestamp a round became eligible for early finalization: roomId -> round -> start time.
    mapping(uint256 => mapping(uint256 => uint256)) public roundStartTime;

    /// @dev Internal array used to enumerate all created room IDs.
    uint256[] private roomIds;

    /// @notice USDm balance reserved for paying treasury-mode winners. Funded by the
    ///         owner via depositTreasury and augmented by the 10 % PvP cut and losing
    ///         treasury-mode stakes.
    uint256 public treasuryBalance;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error RoomAlreadyExists();
    error RoomDoesNotExist();
    error InvalidEntryFee();
    error RoundFull();
    error InvalidSpin();
    error AlreadyPlayed();
    error NoWinners();
    error NotEnoughPlayers();
    error EarlyFinalizeTooSoon();
    error InsufficientTreasury();
    error NotOwner();
    error InvalidTreasuryAmount();

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event RoomCreated(uint256 roomId, uint256 entryFee);
    event Played(address indexed player, uint256 roomId, uint256 round, uint256 spin);
    event RoundCompleted(uint256 roomId, uint256 round, uint256 highestSpin, uint256 winnerCount);
    event Payout(address indexed recipient, uint256 amount, uint256 roomId);
    event TreasuryDeposited(address indexed from, uint256 amount);
    event TreasuryWithdrawn(address indexed to, uint256 amount);
    event TreasuryPlayed(address indexed player, uint256 playerSpin, uint256 treasurySpin, bool won, uint256 payout);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /// @notice Initializes the game with the USDm token and the owner address.
    /// @param usdMToken Address of the Mento Dollar ERC-20 contract on Celo.
    /// @param ownerAddress Address that owns the contract and may fund/withdraw the treasury.
    constructor(address usdMToken, address ownerAddress) {
        require(usdMToken != address(0), "USDm token required");
        require(ownerAddress != address(0), "owner required");

        mentoDollar = IERC20(usdMToken);
        owner = ownerAddress;
    }

    // ---------------------------------------------------------------------
    // PvP room management
    // ---------------------------------------------------------------------

    /// @notice Creates a new PvP game room with a fixed entry fee.
    /// @param roomId A unique identifier for the room.
    /// @param entryFee The USDm amount each player pays to enter a round.
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

    /// @notice Submit a spin to an active PvP room for the current round.
    /// @dev Transfers the entry fee from the caller, records the spin, and
    ///      auto-finalizes the round when the 5th player joins.
    /// @param roomId The room to play in (must exist and not be full).
    /// @param spin The spin value to submit (MIN_SPIN..MAX_SPIN).
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

        // Stamp the start time when the 2nd player joins (round becomes eligible later).
        if (room.playerCount == 1) {
            roundStartTime[roomId][round] = block.timestamp;
        }

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

    /// @notice Finalizes a PvP round early once at least MIN_PLAYERS have joined and
    ///         EARLY_FINALIZE_DELAY seconds have elapsed since the 2nd player joined.
    /// @param roomId The room whose current round should be finalized.
    function finalizeRoundEarly(uint256 roomId) external nonReentrant {
        Room storage room = rooms[roomId];
        if (!room.exists) revert RoomDoesNotExist();

        uint256 round = room.currentRound;
        if (room.playerCount < MIN_PLAYERS) revert NotEnoughPlayers();
        if (block.timestamp < roundStartTime[roomId][round] + EARLY_FINALIZE_DELAY) {
            revert EarlyFinalizeTooSoon();
        }

        _finalizeRound(roomId, round);
    }

    // ---------------------------------------------------------------------
    // Treasury mode (player vs. vault)
    // ---------------------------------------------------------------------

    /// @notice Play a single spin against the treasury vault.
    /// @dev The caller must have approved the contract to transfer `stake` USDm.
    ///      The contract derives a treasury spin from on-chain randomness. If the
    ///      player's spin is strictly higher than the treasury spin, the player wins
    ///      TREASURY_WIN_SHARE % of their stake, paid from treasuryBalance. Otherwise
    ///      the player loses their full stake to the treasury.
    /// @param spin The player's chosen spin value (MIN_SPIN..MAX_SPIN).
    /// @param stake The USDm amount wagered (MIN_ENTRY_FEE..MAX_ENTRY_FEE).
    function playVsTreasury(uint256 spin, uint256 stake) external nonReentrant {
        if (spin < MIN_SPIN || spin > MAX_SPIN) revert InvalidSpin();
        if (stake < MIN_ENTRY_FEE || stake > MAX_ENTRY_FEE) revert InvalidEntryFee();

        // Pull the stake from the player into the contract.
        mentoDollar.safeTransferFrom(msg.sender, address(this), stake);

        // Derive the treasury spin from on-chain randomness.
        // NOTE: prevrandao is manipulable by validators; acceptable for a low-stakes
        // game. For higher stakes a commit-reveal or VRF scheme should be used.
        uint256 treasurySpin = _treasurySpin();

        bool won = spin > treasurySpin;

        if (won) {
            uint256 payout = (stake * TREASURY_WIN_SHARE) / 100;
            if (payout > treasuryBalance) revert InsufficientTreasury();

            // The player's stake stays in the contract; payout comes from the vault.
            treasuryBalance -= payout;
            mentoDollar.safeTransfer(msg.sender, payout + stake);

            emit TreasuryPlayed(msg.sender, spin, treasurySpin, true, payout);
            emit Payout(msg.sender, payout, 0);
        } else {
            // Player loses: their stake is absorbed by the treasury.
            treasuryBalance += stake;
            emit TreasuryPlayed(msg.sender, spin, treasurySpin, false, 0);
        }
    }

    // ---------------------------------------------------------------------
    // Treasury vault management (owner only)
    // ---------------------------------------------------------------------

    /// @notice Deposits USDm into the treasury vault to fund treasury-mode payouts.
    /// @dev Caller must have approved the contract to transfer `amount` USDm.
    /// @param amount The USDm amount to deposit.
    function depositTreasury(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        if (amount == 0) revert InvalidTreasuryAmount();

        mentoDollar.safeTransferFrom(msg.sender, address(this), amount);
        treasuryBalance += amount;

        emit TreasuryDeposited(msg.sender, amount);
    }

    /// @notice Withdraws USDm from the treasury vault back to the owner.
    /// @param amount The USDm amount to withdraw.
    function withdrawTreasury(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        if (amount == 0 || amount > treasuryBalance) revert InvalidTreasuryAmount();

        treasuryBalance -= amount;
        mentoDollar.safeTransfer(msg.sender, amount);

        emit TreasuryWithdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Returns the list of all room IDs that have been created.
    function getRoomIds() external view returns (uint256[] memory) {
        return roomIds;
    }

    /// @notice Returns the player list for a specific round in a room.
    /// @param roomId The room to query.
    /// @param round The round number to query.
    /// @return players An array of Player structs for the requested round.
    function getRoundPlayers(uint256 roomId, uint256 round) external view returns (Player[] memory players) {
        Room memory room = rooms[roomId];
        if (!room.exists) revert RoomDoesNotExist();

        uint256 count = round == room.currentRound ? room.playerCount : MAX_PLAYERS;
        players = new Player[](count);

        for (uint256 i = 0; i < count; i++) {
            players[i] = roundPlayers[roomId][round][i];
        }
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev Finalizes a completed PvP round: TREASURY_SHARE % to the vault and
    ///      WINNER_SHARE % split equally among all players who submitted the
    ///      highest spin. Resets room state for the next round.
    function _finalizeRound(uint256 roomId, uint256 round) private {
        Room storage room = rooms[roomId];
        uint256 winnerCount = _countWinners(roomId, round, room.highestSpin);
        if (winnerCount == 0) revert NoWinners();

        uint256 treasuryAmount = (room.totalPot * TREASURY_SHARE) / 100;
        uint256 winnerPool = (room.totalPot * WINNER_SHARE) / 100;
        uint256 payoutPerWinner = winnerPool / winnerCount;

        // Credit the treasury vault (funds stay in the contract, tracked separately).
        treasuryBalance += treasuryAmount;
        emit Payout(address(this), treasuryAmount, roomId);

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

    /// @dev Counts how many players in a round submitted a specific spin value.
    function _countWinners(uint256 roomId, uint256 round, uint256 targetSpin) private view returns (uint256 count) {
        for (uint256 i = 0; i < MAX_PLAYERS; i++) {
            if (roundPlayers[roomId][round][i].spin == targetSpin) {
                count += 1;
            }
        }
    }

    /// @dev Derives a pseudo-random treasury spin in [MIN_SPIN, MAX_SPIN] from
    ///      on-chain randomness. Uses block.prevrandao, block.timestamp, and the
    ///      caller address as entropy sources.
    function _treasurySpin() internal view returns (uint256) {
        uint256 entropy = uint256(
            keccak256(abi.encodePacked(block.prevrandao, block.timestamp, msg.sender, block.number))
        );
        return (entropy % MAX_SPIN) + MIN_SPIN;
    }
}
