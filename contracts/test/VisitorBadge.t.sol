// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Guestbook} from "../src/Guestbook.sol";
import {VisitorBadge, IGuestbook, IERC5192} from "../src/VisitorBadge.sol";

contract VisitorBadgeTest is Test {
    Guestbook internal book;
    VisitorBadge internal badge;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal eve = makeAddr("eve");

    event Locked(uint256 tokenId);

    function setUp() public {
        vm.warp(1_700_000_000);
        book = new Guestbook(makeAddr("owner"));
        badge = new VisitorBadge(IGuestbook(address(book)));
        vm.prank(alice);
        book.sign("gm");
        vm.prank(bob);
        book.sign("hello");
    }

    function _mintAs(address who) internal returns (uint256) {
        vm.prank(who);
        return badge.mint();
    }

    // ── mint ────────────────────────────────────────────────────────────────

    function test_Mint_EligibleSigner() public {
        vm.expectEmit(false, false, false, true, address(badge));
        emit Locked(1);
        uint256 id = _mintAs(alice);
        assertEq(id, 1);
        assertEq(badge.ownerOf(1), alice);
        assertEq(badge.badgeOf(alice), 1);
        assertEq(badge.mintedAt(1), block.timestamp);
        assertEq(badge.totalSupply(), 1);
    }

    function test_Mint_RevertWhen_NeverSigned() public {
        vm.expectRevert(abi.encodeWithSelector(VisitorBadge.NotEligible.selector, eve));
        _mintAs(eve);
    }

    function test_Mint_RevertWhen_AlreadyMinted() public {
        _mintAs(alice);
        vm.expectRevert(abi.encodeWithSelector(VisitorBadge.AlreadyMinted.selector, alice, 1));
        _mintAs(alice);
    }

    function test_Mint_SequentialIds() public {
        assertEq(_mintAs(alice), 1);
        assertEq(_mintAs(bob), 2);
        assertEq(badge.totalMinted(), 2);
    }

    // ── soulbound ───────────────────────────────────────────────────────────

    function test_Transfer_Reverts() public {
        _mintAs(alice);
        vm.startPrank(alice);
        vm.expectRevert(VisitorBadge.Soulbound.selector);
        badge.transferFrom(alice, bob, 1);
        vm.expectRevert(VisitorBadge.Soulbound.selector);
        badge.safeTransferFrom(alice, bob, 1);
        vm.expectRevert(VisitorBadge.Soulbound.selector);
        badge.safeTransferFrom(alice, bob, 1, "");
        vm.stopPrank();
        assertEq(badge.ownerOf(1), alice);
    }

    function test_Approvals_Revert() public {
        _mintAs(alice);
        vm.startPrank(alice);
        vm.expectRevert(VisitorBadge.Soulbound.selector);
        badge.approve(bob, 1);
        vm.expectRevert(VisitorBadge.Soulbound.selector);
        badge.setApprovalForAll(bob, true);
        vm.stopPrank();
    }

    function test_Locked_TrueForExisting_RevertsForMissing() public {
        _mintAs(alice);
        assertTrue(badge.locked(1));
        vm.expectRevert();
        badge.locked(2);
    }

    function test_SupportsInterfaces() public view {
        assertTrue(badge.supportsInterface(0xb45a3c0e)); // ERC-5192
        assertTrue(badge.supportsInterface(type(IERC5192).interfaceId));
        assertTrue(badge.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(badge.supportsInterface(0x5b5e139f)); // ERC-721 Metadata
        assertTrue(badge.supportsInterface(0x01ffc9a7)); // ERC-165
        assertFalse(badge.supportsInterface(0xffffffff));
    }

    // ── burn ────────────────────────────────────────────────────────────────

    function test_Burn_ByHolder_ThenMintAgain() public {
        _mintAs(alice);
        vm.prank(alice);
        badge.burn(1);
        assertEq(badge.badgeOf(alice), 0);
        assertEq(badge.balanceOf(alice), 0);
        assertEq(badge.totalSupply(), 0);
        vm.expectRevert();
        badge.ownerOf(1);

        assertEq(_mintAs(alice), 2, "ids are never reused");
        assertEq(badge.totalSupply(), 1);
    }

    function test_Burn_RevertWhen_NotHolder() public {
        _mintAs(alice);
        vm.expectRevert(abi.encodeWithSelector(VisitorBadge.NotHolder.selector, bob, 1));
        vm.prank(bob);
        badge.burn(1);
    }

    // ── metadata ────────────────────────────────────────────────────────────

    function test_TokenURI_IsBase64Json() public {
        _mintAs(alice);
        string memory uri = badge.tokenURI(1);
        bytes memory b = bytes(uri);
        bytes memory prefix = bytes("data:application/json;base64,");
        assertGt(b.length, prefix.length + 100);
        for (uint256 i; i < prefix.length; ++i) {
            assertEq(uint8(b[i]), uint8(prefix[i]));
        }
    }

    function test_TokenURI_RevertWhen_Missing() public {
        vm.expectRevert();
        badge.tokenURI(1);
    }

    // ── fuzz ────────────────────────────────────────────────────────────────

    function testFuzz_OnlySignersCanMint(address who, bool signs) public {
        // Plain EOAs only: skip precompiles, the cheatcode address and anything with code.
        vm.assume(uint160(who) > 0xffff && who != address(vm) && who != alice && who != bob && who.code.length == 0);
        if (signs) {
            vm.prank(who);
            book.sign("x");
        } else {
            vm.expectRevert(abi.encodeWithSelector(VisitorBadge.NotEligible.selector, who));
        }
        vm.prank(who);
        badge.mint();
        assertEq(badge.balanceOf(who), signs ? 1 : 0);
    }

    function testFuzz_TransferAlwaysReverts(address to) public {
        vm.assume(to != address(0) && to != alice);
        _mintAs(alice);
        vm.expectRevert(VisitorBadge.Soulbound.selector);
        vm.prank(alice);
        badge.transferFrom(alice, to, 1);
    }
}
