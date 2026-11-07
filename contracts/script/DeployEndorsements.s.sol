// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Endorsements} from "../src/Endorsements.sol";

/// Deploys Endorsements and seeds the skill list. The broadcasting account becomes owner.
///
///   forge script script/DeployEndorsements.s.sol --rpc-url base_sepolia --account deployer --broadcast --verify
contract DeployEndorsements is Script {
    function run() external returns (Endorsements e) {
        string[5] memory skills =
            ["Solidity", "Smart contract security", "On-chain intelligence", "AI systems", "Backend engineering"];
        vm.startBroadcast();
        e = new Endorsements(msg.sender);
        for (uint256 i; i < skills.length; ++i) {
            e.addSkill(skills[i]);
        }
        vm.stopBroadcast();
        console.log("Endorsements deployed at", address(e));
    }
}
