// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Guestbook} from "../src/Guestbook.sol";

contract GuestbookTest is Test {
    Guestbook internal book;
    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    event Signed(uint256 indexed id, address indexed author, string message);
    event VisibilityChanged(uint256 indexed id, bool hidden);

    function setUp() public {
        vm.warp(1_700_000_000);
        book = new Guestbook(owner);
    }

    function _repeat(bytes1 c, uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i; i < n; ++i) b[i] = c;
        return string(b);
    }

    // ── sign ────────────────────────────────────────────────────────────────

    function test_Sign_StoresEntryAndEmits() public {
        vm.expectEmit(true, true, false, true, address(book));
        emit Signed(0, alice, "gm");
        vm.prank(alice);
        uint256 id = book.sign("gm");

        assertEq(id, 0);
        assertEq(book.count(), 1);
        Guestbook.Entry memory e = book.entry(0);
        assertEq(e.author, alice);
        assertEq(e.timestamp, block.timestamp);
        assertFalse(e.hidden);
        assertEq(e.message, "gm");
        assertEq(book.lastSignedAt(alice), block.timestamp);
    }

    function test_Sign_IdsIncrementAcrossAuthors() public {
        vm.prank(alice);
        assertEq(book.sign("one"), 0);
        vm.prank(bob);
        assertEq(book.sign("two"), 1);
        assertEq(book.count(), 2);
    }

    function test_Sign_RevertWhen_Empty() public {
        vm.expectRevert(Guestbook.EmptyMessage.selector);
        vm.prank(alice);
        book.sign("");
    }

    function test_Sign_AcceptsExactlyMaxBytes() public {
        vm.prank(alice);
        book.sign(_repeat("a", 140));
        assertEq(bytes(book.entry(0).message).length, 140);
    }

    function test_Sign_RevertWhen_TooLong() public {
        vm.expectRevert(abi.encodeWithSelector(Guestbook.MessageTooLong.selector, 141, 140));
        vm.prank(alice);
        book.sign(_repeat("a", 141));
    }

    function test_Sign_LimitCountsBytesNotCharacters() public {
        // "é" is 2 bytes in UTF-8, so 71 of them is 142 bytes.
        bytes memory b = new bytes(142);
        for (uint256 i; i < 142; i += 2) {
            b[i] = 0xc3;
            b[i + 1] = 0xa9;
        }
        vm.expectRevert(abi.encodeWithSelector(Guestbook.MessageTooLong.selector, 142, 140));
        vm.prank(alice);
        book.sign(string(b));
    }

    function test_Sign_RevertWhen_CooldownActive() public {
        vm.startPrank(alice);
        book.sign("first");
        uint256 availableAt = block.timestamp + book.COOLDOWN();
        vm.warp(availableAt - 1);
        vm.expectRevert(abi.encodeWithSelector(Guestbook.CooldownActive.selector, availableAt));
        book.sign("second");
        vm.stopPrank();
    }

    function test_Sign_AllowedAgainAtCooldownBoundary() public {
        vm.startPrank(alice);
        book.sign("first");
        vm.warp(block.timestamp + book.COOLDOWN());
        book.sign("second");
        vm.stopPrank();
        assertEq(book.count(), 2);
    }

    function test_Sign_CooldownIsPerAuthor() public {
        vm.prank(alice);
        book.sign("alice");
        vm.prank(bob);
        book.sign("bob");
        assertEq(book.count(), 2);
    }

    // ── moderation ──────────────────────────────────────────────────────────

    function test_SetHidden_ByOwner() public {
        vm.prank(alice);
        book.sign("spam");

        vm.expectEmit(true, false, false, true, address(book));
        emit VisibilityChanged(0, true);
        vm.prank(owner);
        book.setHidden(0, true);
        assertTrue(book.entry(0).hidden);

        vm.prank(owner);
        book.setHidden(0, false);
        assertFalse(book.entry(0).hidden);
    }

    function test_SetHidden_RevertWhen_NotOwner() public {
        vm.prank(alice);
        book.sign("hi");
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        book.setHidden(0, true);
    }

    function test_SetHidden_RevertWhen_UnknownEntry() public {
        vm.expectRevert(abi.encodeWithSelector(Guestbook.UnknownEntry.selector, 0));
        vm.prank(owner);
        book.setHidden(0, true);
    }

    function test_Entry_RevertWhen_Unknown() public {
        vm.expectRevert(abi.encodeWithSelector(Guestbook.UnknownEntry.selector, 3));
        book.entry(3);
    }

    // ── ownership (two-step) ────────────────────────────────────────────────

    function test_Ownership_TransferNeedsAcceptance() public {
        vm.prank(owner);
        book.transferOwnership(bob);
        assertEq(book.owner(), owner);
        assertEq(book.pendingOwner(), bob);

        vm.prank(bob);
        book.acceptOwnership();
        assertEq(book.owner(), bob);
    }

    // ── pagination ──────────────────────────────────────────────────────────

    function _seed(uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            vm.prank(address(uint160(0x1000 + i)));
            book.sign(vm.toString(i));
        }
    }

    function test_GetEntries_Pages() public {
        _seed(5);
        Guestbook.Entry[] memory page = book.getEntries(1, 3);
        assertEq(page.length, 3);
        assertEq(page[0].message, "1");
        assertEq(page[2].message, "3");
    }

    function test_GetEntries_ClampsAtEnd() public {
        _seed(5);
        Guestbook.Entry[] memory page = book.getEntries(3, 10);
        assertEq(page.length, 2);
        assertEq(page[1].message, "4");
    }

    function test_GetEntries_EmptyWhenOutOfRange() public {
        _seed(2);
        assertEq(book.getEntries(2, 10).length, 0);
        assertEq(book.getEntries(type(uint256).max, type(uint256).max).length, 0);
    }

    function test_GetEntries_NoOverflowWithHugeLimit() public {
        _seed(3);
        assertEq(book.getEntries(1, type(uint256).max).length, 2);
    }

    // ── fuzz ────────────────────────────────────────────────────────────────

    function testFuzz_Sign_LengthRule(uint256 len) public {
        len = bound(len, 0, 400);
        string memory m = _repeat("x", len);
        if (len == 0) vm.expectRevert(Guestbook.EmptyMessage.selector);
        else if (len > 140) vm.expectRevert(abi.encodeWithSelector(Guestbook.MessageTooLong.selector, len, 140));
        vm.prank(alice);
        book.sign(m);
        assertEq(book.count(), (len >= 1 && len <= 140) ? 1 : 0);
    }

    function testFuzz_Sign_CooldownWindow(uint256 wait) public {
        wait = bound(wait, 0, 3 hours);
        vm.prank(alice);
        book.sign("first");
        uint256 first = block.timestamp;
        vm.warp(first + wait);
        if (wait < book.COOLDOWN()) {
            vm.expectRevert(abi.encodeWithSelector(Guestbook.CooldownActive.selector, first + book.COOLDOWN()));
        }
        vm.prank(alice);
        book.sign("second");
    }

    function testFuzz_GetEntries_LengthMatchesRange(uint8 n, uint256 start, uint256 limit) public {
        n = uint8(bound(n, 0, 20));
        _seed(n);
        Guestbook.Entry[] memory page = book.getEntries(start, limit);
        uint256 expected = start >= n ? 0 : (n - start < limit ? n - start : limit);
        assertEq(page.length, expected);
    }
}
