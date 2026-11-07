// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title Guestbook
/// @author Tatas Handharu
/// @notice Visitors of onchain.tatas.anxentlab.my.id leave a short public message, at most one per cooldown window.
/// @dev Entries live in storage so the frontend can page through them with a view call instead of scanning logs.
///      `hidden` is moderation for the UI only: the message stays on-chain and in the `Signed` event.
contract Guestbook is Ownable2Step {
    struct Entry {
        address author;
        uint64 timestamp;
        bool hidden;
        string message;
    }

    /// @notice Maximum message length in bytes (UTF-8), not characters.
    uint256 public constant MAX_MESSAGE_BYTES = 140;
    /// @notice Minimum time between two entries from the same address.
    uint256 public constant COOLDOWN = 1 hours;

    Entry[] private _entries;
    mapping(address author => uint256 timestamp) public lastSignedAt;

    event Signed(uint256 indexed id, address indexed author, string message);
    event VisibilityChanged(uint256 indexed id, bool hidden);

    error EmptyMessage();
    error MessageTooLong(uint256 length, uint256 max);
    error CooldownActive(uint256 availableAt);
    error UnknownEntry(uint256 id);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Write a message to the guestbook.
    /// @return id Index of the new entry.
    function sign(string calldata message) external returns (uint256 id) {
        uint256 length = bytes(message).length;
        if (length == 0) revert EmptyMessage();
        if (length > MAX_MESSAGE_BYTES) revert MessageTooLong(length, MAX_MESSAGE_BYTES);

        uint256 last = lastSignedAt[msg.sender];
        if (last != 0 && block.timestamp < last + COOLDOWN) revert CooldownActive(last + COOLDOWN);

        lastSignedAt[msg.sender] = block.timestamp;
        id = _entries.length;
        _entries.push(Entry({author: msg.sender, timestamp: uint64(block.timestamp), hidden: false, message: message}));
        emit Signed(id, msg.sender, message);
    }

    /// @notice Hide or unhide an entry in the UI. Owner only.
    function setHidden(uint256 id, bool hidden) external onlyOwner {
        if (id >= _entries.length) revert UnknownEntry(id);
        _entries[id].hidden = hidden;
        emit VisibilityChanged(id, hidden);
    }

    /// @notice Number of entries ever written, hidden ones included.
    function count() external view returns (uint256) {
        return _entries.length;
    }

    /// @notice Read one entry.
    function entry(uint256 id) external view returns (Entry memory) {
        if (id >= _entries.length) revert UnknownEntry(id);
        return _entries[id];
    }

    /// @notice Read up to `limit` entries starting at index `start` (oldest first). Out-of-range reads return fewer.
    function getEntries(uint256 start, uint256 limit) external view returns (Entry[] memory page) {
        uint256 total = _entries.length;
        if (start >= total) return new Entry[](0);
        uint256 end = total - start < limit ? total : start + limit;
        page = new Entry[](end - start);
        for (uint256 i = start; i < end; ++i) {
            page[i - start] = _entries[i];
        }
    }
}
