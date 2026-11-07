// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Endorsements} from "../src/Endorsements.sol";

/// @dev Random direct endorsements, signed endorsements (some replayed), and withdrawals by a fixed set of keys.
contract EndorsementsHandler is Test {
    Endorsements internal immutable e;
    uint256[] internal pks;
    address[] public actors;
    uint256 public constant SKILLS = 3;

    mapping(address => mapping(uint256 => bool)) public ghostEndorsed;
    mapping(address => uint256) public ghostSigUses;
    bytes[] internal usedSigs;
    address[] internal usedSigEndorser;
    uint256[] internal usedSigSkill;
    uint256[] internal usedSigDeadline;

    constructor(Endorsements e_) {
        e = e_;
        for (uint256 i = 1; i <= 4; ++i) {
            pks.push(0x1000 + i);
            actors.push(vm.addr(0x1000 + i));
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function endorse(uint256 actorSeed, uint256 skillSeed) external {
        address a = actors[actorSeed % actors.length];
        uint256 skillId = skillSeed % SKILLS;
        vm.prank(a);
        try e.endorse(skillId) {
            assertFalse(ghostEndorsed[a][skillId], "double endorsement accepted");
            ghostEndorsed[a][skillId] = true;
        } catch {
            assertTrue(ghostEndorsed[a][skillId], "valid endorsement rejected");
        }
    }

    function endorseBySig(uint256 actorSeed, uint256 skillSeed) external {
        uint256 i = actorSeed % actors.length;
        address a = actors[i];
        uint256 skillId = skillSeed % SKILLS;
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(e.ENDORSE_TYPEHASH(), a, skillId, e.nonces(a), deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", e.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pks[i], digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        try e.endorseBySig(a, skillId, deadline, sig) {
            assertFalse(ghostEndorsed[a][skillId], "double endorsement via sig");
            ghostEndorsed[a][skillId] = true;
            ghostSigUses[a]++;
            usedSigs.push(sig);
            usedSigEndorser.push(a);
            usedSigSkill.push(skillId);
            usedSigDeadline.push(deadline);
        } catch {
            assertTrue(ghostEndorsed[a][skillId], "valid signature rejected");
        }
    }

    /// Replaying any signature that already went through must always fail.
    function replay(uint256 seed) external {
        if (usedSigs.length == 0) return;
        uint256 k = seed % usedSigs.length;
        try e.endorseBySig(usedSigEndorser[k], usedSigSkill[k], usedSigDeadline[k], usedSigs[k]) {
            fail();
        } catch {}
    }

    function unendorse(uint256 actorSeed, uint256 skillSeed) external {
        address a = actors[actorSeed % actors.length];
        uint256 skillId = skillSeed % SKILLS;
        vm.prank(a);
        try e.unendorse(skillId) {
            assertTrue(ghostEndorsed[a][skillId]);
            ghostEndorsed[a][skillId] = false;
        } catch {
            assertFalse(ghostEndorsed[a][skillId]);
        }
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 30 minutes));
    }
}

contract EndorsementsInvariantTest is Test {
    Endorsements internal e;
    EndorsementsHandler internal handler;

    function setUp() public {
        vm.warp(1_700_000_000);
        address owner = makeAddr("owner");
        e = new Endorsements(owner);
        vm.startPrank(owner);
        e.addSkill("Solidity");
        e.addSkill("Smart contract security");
        e.addSkill("On-chain intelligence");
        vm.stopPrank();
        handler = new EndorsementsHandler(e);
        targetContract(address(handler));
    }

    /// Each skill's counter equals the number of actors currently endorsing it.
    function invariant_CountMatchesEndorsers() public view {
        for (uint256 s; s < handler.SKILLS(); ++s) {
            uint256 expected;
            for (uint256 i; i < handler.actorCount(); ++i) {
                address a = handler.actors(i);
                bool on = e.hasEndorsed(a, s);
                assertEq(on, handler.ghostEndorsed(a, s));
                if (on) expected++;
            }
            assertEq(e.endorsementCount(s), expected);
        }
    }

    /// A nonce moves only when a signed endorsement succeeds.
    function invariant_NonceEqualsSuccessfulSignatures() public view {
        for (uint256 i; i < handler.actorCount(); ++i) {
            address a = handler.actors(i);
            assertEq(e.nonces(a), handler.ghostSigUses(a));
        }
    }
}
