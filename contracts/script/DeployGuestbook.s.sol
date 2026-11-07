// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Guestbook} from "../src/Guestbook.sol";

/// Deploys Guestbook with the broadcasting account as owner, unless GUESTBOOK_OWNER is set.
///
///   forge script script/DeployGuestbook.s.sol --rpc-url base_sepolia --account deployer --broadcast --verify
contract DeployGuestbook is Script {
    function run() external returns (Guestbook book) {
        vm.startBroadcast();
        address owner = vm.envOr("GUESTBOOK_OWNER", msg.sender);
        book = new Guestbook(owner);
        vm.stopBroadcast();
        console.log("Guestbook deployed at", address(book));
        console.log("Owner", owner);
    }
}
