// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Guestbook} from "../src/Guestbook.sol";
import {Endorsements} from "../src/Endorsements.sol";
import {VisitorBadge, IGuestbook} from "../src/VisitorBadge.sol";

/// Deploys the full set (Guestbook, Endorsements with seeded skills, VisitorBadge) in one broadcast.
/// The broadcasting account owns Guestbook and Endorsements. Used for Base mainnet.
///
///   Dry run (no broadcast, no ETH spent):
///     forge script script/DeployAll.s.sol --rpc-url base --account deployer
///   Real deploy:
///     forge script script/DeployAll.s.sol --rpc-url base --account deployer --broadcast --verify
contract DeployAll is Script {
    function run() external returns (Guestbook book, Endorsements endorsements, VisitorBadge badge) {
        string[5] memory skills =
            ["Solidity", "Smart contract security", "On-chain intelligence", "AI systems", "Backend engineering"];

        vm.startBroadcast();
        book = new Guestbook(msg.sender);
        endorsements = new Endorsements(msg.sender);
        for (uint256 i; i < skills.length; ++i) {
            endorsements.addSkill(skills[i]);
        }
        badge = new VisitorBadge(IGuestbook(address(book)));
        vm.stopBroadcast();

        console.log("Chain id", block.chainid);
        console.log("Owner", msg.sender);
        console.log("NEXT_PUBLIC_GUESTBOOK_ADDRESS=", address(book));
        console.log("NEXT_PUBLIC_ENDORSEMENTS_ADDRESS=", address(endorsements));
        console.log("NEXT_PUBLIC_BADGE_ADDRESS=", address(badge));
    }
}
