// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Guestbook} from "../src/Guestbook.sol";
import {VisitorBadge, IGuestbook} from "../src/VisitorBadge.sol";

/// @dev Random signing, minting, burning and attempted transfers by a fixed set of actors.
contract BadgeHandler is Test {
    Guestbook internal immutable book;
    VisitorBadge internal immutable badge;
    address[] public actors;

    mapping(address => bool) public ghostSigned;
    mapping(uint256 => address) public ghostMintedTo;
    uint256 public ghostMints;
    uint256 public ghostBurns;
    uint256 public ghostTransferSuccesses;

    constructor(Guestbook book_, VisitorBadge badge_) {
        book = book_;
        badge = badge_;
        for (uint256 i; i < 5; ++i) actors.push(address(uint160(0xB0000 + i)));
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function sign(uint256 seed) external {
        address a = actors[seed % actors.length];
        vm.prank(a);
        try book.sign("hi") {
            ghostSigned[a] = true;
        } catch {}
    }

    function mint(uint256 seed) external {
        address a = actors[seed % actors.length];
        bool expectOk = ghostSigned[a] && badge.badgeOf(a) == 0;
        vm.prank(a);
        try badge.mint() returns (uint256 id) {
            assertTrue(expectOk, "mint succeeded when it should not");
            ghostMints++;
            ghostMintedTo[id] = a;
        } catch {
            assertFalse(expectOk, "eligible mint failed");
        }
    }

    function burn(uint256 seed) external {
        address a = actors[seed % actors.length];
        uint256 id = badge.badgeOf(a);
        if (id == 0) return;
        vm.prank(a);
        badge.burn(id);
        ghostBurns++;
    }

    function tryTransfer(uint256 fromSeed, uint256 toSeed) external {
        address from = actors[fromSeed % actors.length];
        address to = actors[toSeed % actors.length];
        uint256 id = badge.badgeOf(from);
        if (id == 0 || from == to) return;
        vm.prank(from);
        try badge.transferFrom(from, to, id) {
            ghostTransferSuccesses++;
        } catch {}
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 2 hours));
    }
}

contract VisitorBadgeInvariantTest is Test {
    Guestbook internal book;
    VisitorBadge internal badge;
    BadgeHandler internal handler;

    function setUp() public {
        vm.warp(1_700_000_000);
        book = new Guestbook(makeAddr("owner"));
        badge = new VisitorBadge(IGuestbook(address(book)));
        handler = new BadgeHandler(book, badge);
        targetContract(address(handler));
    }

    function invariant_NoTransferEverSucceeds() public view {
        assertEq(handler.ghostTransferSuccesses(), 0);
    }

    function invariant_SupplyAccounting() public view {
        assertEq(badge.totalMinted(), handler.ghostMints());
        assertEq(badge.totalSupply(), handler.ghostMints() - handler.ghostBurns());
        uint256 sum;
        for (uint256 i; i < handler.actorCount(); ++i) {
            uint256 bal = badge.balanceOf(handler.actors(i));
            assertLe(bal, 1, "more than one badge per address");
            sum += bal;
        }
        assertEq(sum, badge.totalSupply());
    }

    function invariant_BadgesStayWithMinter() public view {
        for (uint256 i; i < handler.actorCount(); ++i) {
            address a = handler.actors(i);
            uint256 id = badge.badgeOf(a);
            if (id != 0) {
                assertEq(badge.ownerOf(id), a);
                assertEq(handler.ghostMintedTo(id), a);
            }
        }
    }
}
