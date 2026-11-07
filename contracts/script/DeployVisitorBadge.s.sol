// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VisitorBadge, IGuestbook} from "../src/VisitorBadge.sol";

/// Deploys VisitorBadge pointing at an existing Guestbook.
///
///   GUESTBOOK=0x... forge script script/DeployVisitorBadge.s.sol --rpc-url base_sepolia --account deployer --broadcast --verify
contract DeployVisitorBadge is Script {
    function run() external returns (VisitorBadge badge) {
        address guestbook = vm.envAddress("GUESTBOOK");
        require(guestbook.code.length > 0, "GUESTBOOK has no code on this chain");
        vm.startBroadcast();
        badge = new VisitorBadge(IGuestbook(guestbook));
        vm.stopBroadcast();
        console.log("VisitorBadge deployed at", address(badge));
        console.log("Guestbook", guestbook);
    }
}
