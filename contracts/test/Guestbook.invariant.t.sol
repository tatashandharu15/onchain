// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Guestbook} from "../src/Guestbook.sol";

/// @dev Drives random sign / warp / setHidden calls and records what should be true.
contract GuestbookHandler is Test {
    Guestbook internal immutable book;
    address internal immutable owner;
    address[] internal actors;

    uint256 public ghostSigned;
    mapping(address => uint256) public ghostLast;

    constructor(Guestbook book_, address owner_) {
        book = book_;
        owner = owner_;
        for (uint256 i; i < 5; ++i) actors.push(address(uint160(0xA11CE + i)));
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function actorAt(uint256 i) external view returns (address) {
        return actors[i];
    }

    function sign(uint256 actorSeed, uint256 len) external {
        address a = actors[actorSeed % actors.length];
        len = bound(len, 0, 200);
        bytes memory b = new bytes(len);
        for (uint256 i; i < len; ++i) b[i] = "z";

        bool ok = len >= 1 && len <= book.MAX_MESSAGE_BYTES()
            && (ghostLast[a] == 0 || block.timestamp >= ghostLast[a] + book.COOLDOWN());

        vm.prank(a);
        try book.sign(string(b)) {
            assertTrue(ok, "sign succeeded when it should revert");
            ghostSigned++;
            ghostLast[a] = block.timestamp;
        } catch {
            assertFalse(ok, "sign reverted when it should succeed");
        }
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 2 hours));
    }

    function hide(uint256 idSeed, bool hidden) external {
        uint256 n = book.count();
        if (n == 0) return;
        vm.prank(owner);
        book.setHidden(idSeed % n, hidden);
    }
}

contract GuestbookInvariantTest is Test {
    Guestbook internal book;
    GuestbookHandler internal handler;
    address internal owner = makeAddr("owner");

    function setUp() public {
        vm.warp(1_700_000_000);
        book = new Guestbook(owner);
        handler = new GuestbookHandler(book, owner);
        targetContract(address(handler));
    }

    /// Every successful sign adds exactly one entry; nothing else does.
    function invariant_CountMatchesSuccessfulSigns() public view {
        assertEq(book.count(), handler.ghostSigned());
    }

    /// Stored messages always respect the length rule.
    function invariant_MessagesWithinBounds() public view {
        uint256 n = book.count();
        for (uint256 i; i < n; ++i) {
            uint256 len = bytes(book.entry(i).message).length;
            assertGt(len, 0);
            assertLe(len, book.MAX_MESSAGE_BYTES());
        }
    }

    /// Entries are append-only in time and authors' last-sign times are never in the future.
    function invariant_TimestampsOrderedAndNotInFuture() public view {
        uint256 n = book.count();
        uint256 prev;
        for (uint256 i; i < n; ++i) {
            Guestbook.Entry memory e = book.entry(i);
            assertGe(e.timestamp, prev);
            assertLe(e.timestamp, block.timestamp);
            prev = e.timestamp;
        }
        for (uint256 i; i < handler.actorCount(); ++i) {
            assertLe(book.lastSignedAt(handler.actorAt(i)), block.timestamp);
        }
    }

    /// Ownership never moves without the two-step flow.
    function invariant_OwnerUnchanged() public view {
        assertEq(book.owner(), owner);
    }
}
