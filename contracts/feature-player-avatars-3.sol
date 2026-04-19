// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GyroBoardfeature-player-avatars3
 * @notice Helper module for Player avatar selection system
 * @dev Part 3 of the feature-player-avatars enhancement
 */
contract GyroBoard3Helper {
    uint256 public constant MODULE_ID = 3;
    uint256 public constant MIN_SPIN = 1;
    uint256 public constant MAX_SPIN = 10;

    mapping(bytes32 => uint256) public moduleCounters;
    mapping(address => uint256) public userInteractions;

    event ModuleAction(
        bytes32 indexed roomId,
        address indexed player,
        uint256 spinValue,
        uint256 timestamp
    );

    error InvalidSpinValue(uint256 provided, uint256 minAllowed, uint256 maxAllowed);
    error RoomNotFound(bytes32 roomId);

    modifier validSpin(uint256 spin) {
        if (spin < MIN_SPIN || spin > MAX_SPIN) {
            revert InvalidSpinValue(spin, MIN_SPIN, MAX_SPIN);
        }
        _;
    }

    function recordAction3(bytes32 roomId, uint256 spinValue)
        external
        validSpin(spinValue)
    {
        moduleCounters[roomId] += 1;
        userInteractions[msg.sender] += 1;
        emit ModuleAction(roomId, msg.sender, spinValue, block.timestamp);
    }

    function getModuleStats3(bytes32 roomId)
        external
        view
        returns (uint256 counter, uint256 moduleId)
    {
        return (moduleCounters[roomId], MODULE_ID);
    }

    function getUserStats3(address user)
        external
        view
        returns (uint256 interactions)
    {
        return userInteractions[user];
    }
}
