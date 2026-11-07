// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {Endorsements} from "../src/Endorsements.sol";

/// Minimal ERC-1271 wallet: accepts digests signed by its EOA owner.
contract MockSmartWallet is IERC1271 {
    address public immutable signer;

    constructor(address signer_) {
        signer = signer_;
    }

    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        (uint8 v, bytes32 r, bytes32 s) = abi.decode(sig, (uint8, bytes32, bytes32));
        return ecrecover(hash, v, r, s) == signer ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }

    function endorse(Endorsements e, uint256 skillId) external {
        e.endorse(skillId);
    }
}

contract EndorsementsTest is Test {
    Endorsements internal e;
    address internal owner = makeAddr("owner");
    address internal relayer = makeAddr("relayer");
    uint256 internal alicePk = 0xA11CE;
    address internal alice = vm.addr(0xA11CE);
    uint256 internal bobPk = 0xB0B;
    address internal bob = vm.addr(0xB0B);

    // secp256k1 group order, for the malleability test
    uint256 internal constant N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    event Endorsed(address indexed endorser, uint256 indexed skillId, bool viaSignature);
    event Unendorsed(address indexed endorser, uint256 indexed skillId);

    function setUp() public {
        vm.warp(1_700_000_000);
        e = new Endorsements(owner);
        vm.startPrank(owner);
        e.addSkill("Solidity");
        e.addSkill("Smart contract security");
        e.addSkill("On-chain intelligence");
        vm.stopPrank();
    }

    function _digest(Endorsements target, address endorser, uint256 skillId, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(target.ENDORSE_TYPEHASH(), endorser, skillId, nonce, deadline));
        return keccak256(abi.encodePacked("\x19\x01", target.DOMAIN_SEPARATOR(), structHash));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signEndorse(uint256 pk, address endorser, uint256 skillId, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _sign(pk, _digest(e, endorser, skillId, e.nonces(endorser), deadline));
    }

    // ── skills ──────────────────────────────────────────────────────────────

    function test_AddSkill_OwnerOnly() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        e.addSkill("Hacking");
    }

    function test_AddSkill_RejectsEmptyAndTooLong() public {
        vm.startPrank(owner);
        vm.expectRevert(Endorsements.InvalidSkillName.selector);
        e.addSkill("");
        bytes memory long = new bytes(49);
        vm.expectRevert(Endorsements.InvalidSkillName.selector);
        e.addSkill(string(long));
        vm.stopPrank();
    }

    function test_GetSkills_ReturnsNamesCountsAndViewerFlags() public {
        vm.prank(alice);
        e.endorse(1);
        (string[] memory names, uint256[] memory counts, bool[] memory mine) = e.getSkills(alice);
        assertEq(names.length, 3);
        assertEq(names[1], "Smart contract security");
        assertEq(counts[1], 1);
        assertTrue(mine[1]);
        assertFalse(mine[0]);
    }

    // ── direct endorse ──────────────────────────────────────────────────────

    function test_Endorse_Direct() public {
        vm.expectEmit(true, true, false, true, address(e));
        emit Endorsed(alice, 0, false);
        vm.prank(alice);
        e.endorse(0);
        assertTrue(e.hasEndorsed(alice, 0));
        assertEq(e.endorsementCount(0), 1);
    }

    function test_Endorse_RevertWhen_Duplicate() public {
        vm.startPrank(alice);
        e.endorse(0);
        vm.expectRevert(abi.encodeWithSelector(Endorsements.AlreadyEndorsed.selector, alice, 0));
        e.endorse(0);
        vm.stopPrank();
    }

    function test_Endorse_RevertWhen_UnknownSkill() public {
        vm.expectRevert(abi.encodeWithSelector(Endorsements.UnknownSkill.selector, 3));
        vm.prank(alice);
        e.endorse(3);
    }

    function test_Unendorse_AndEndorseAgain() public {
        vm.startPrank(alice);
        e.endorse(2);
        vm.expectEmit(true, true, false, false, address(e));
        emit Unendorsed(alice, 2);
        e.unendorse(2);
        assertEq(e.endorsementCount(2), 0);
        e.endorse(2);
        assertEq(e.endorsementCount(2), 1);
        vm.stopPrank();
    }

    function test_Unendorse_RevertWhen_NotEndorsed() public {
        vm.expectRevert(abi.encodeWithSelector(Endorsements.NotEndorsed.selector, alice, 0));
        vm.prank(alice);
        e.unendorse(0);
    }

    // ── signed endorse ──────────────────────────────────────────────────────

    function test_EndorseBySig_RelayerSubmits() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signEndorse(alicePk, alice, 1, deadline);

        vm.expectEmit(true, true, false, true, address(e));
        emit Endorsed(alice, 1, true);
        vm.prank(relayer);
        e.endorseBySig(alice, 1, deadline, sig);

        assertTrue(e.hasEndorsed(alice, 1));
        assertFalse(e.hasEndorsed(relayer, 1));
        assertEq(e.nonces(alice), 1);
    }

    function test_EndorseBySig_RevertWhen_Expired() public {
        uint256 deadline = block.timestamp + 10;
        bytes memory sig = _signEndorse(alicePk, alice, 0, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(Endorsements.SignatureExpired.selector, deadline));
        e.endorseBySig(alice, 0, deadline, sig);
    }

    function test_EndorseBySig_WorksAtExactDeadline() public {
        uint256 deadline = block.timestamp + 10;
        bytes memory sig = _signEndorse(alicePk, alice, 0, deadline);
        vm.warp(deadline);
        e.endorseBySig(alice, 0, deadline, sig);
        assertTrue(e.hasEndorsed(alice, 0));
    }

    function test_EndorseBySig_RevertWhen_SignedByAnotherKey() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signEndorse(bobPk, alice, 0, deadline); // bob tries to endorse in alice's name
        vm.expectRevert(Endorsements.InvalidSignature.selector);
        e.endorseBySig(alice, 0, deadline, sig);
    }

    function test_EndorseBySig_RevertWhen_FieldsTampered() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signEndorse(alicePk, alice, 0, deadline);
        vm.expectRevert(Endorsements.InvalidSignature.selector);
        e.endorseBySig(alice, 1, deadline, sig); // different skill
        vm.expectRevert(Endorsements.InvalidSignature.selector);
        e.endorseBySig(alice, 0, deadline + 1, sig); // different deadline
    }

    function test_EndorseBySig_RevertWhen_Replayed() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signEndorse(alicePk, alice, 0, deadline);
        e.endorseBySig(alice, 0, deadline, sig);

        // Even after alice withdraws, the old signature is dead: its nonce was consumed.
        vm.prank(alice);
        e.unendorse(0);
        vm.expectRevert(Endorsements.InvalidSignature.selector);
        e.endorseBySig(alice, 0, deadline, sig);
    }

    function test_EndorseBySig_RevertWhen_ReplayedOnAnotherChain() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signEndorse(alicePk, alice, 0, deadline);
        vm.chainId(8453); // same contract address, different chain → different domain separator
        vm.expectRevert(Endorsements.InvalidSignature.selector);
        e.endorseBySig(alice, 0, deadline, sig);
    }

    function test_EndorseBySig_RevertWhen_ReplayedOnAnotherDeployment() public {
        Endorsements other = new Endorsements(owner);
        vm.prank(owner);
        other.addSkill("Solidity");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signEndorse(alicePk, alice, 0, deadline); // signed for `e`
        vm.expectRevert(Endorsements.InvalidSignature.selector);
        other.endorseBySig(alice, 0, deadline, sig);
    }

    function test_EndorseBySig_RevertWhen_MalleatedHighS() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _digest(e, alice, 0, e.nonces(alice), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePk, digest);
        bytes32 highS = bytes32(N - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;
        vm.expectRevert(Endorsements.InvalidSignature.selector);
        e.endorseBySig(alice, 0, deadline, abi.encodePacked(r, highS, flippedV));
    }

    function test_EndorseBySig_RevertWhen_ZeroAddressEndorser() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory garbage = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
        vm.expectRevert(Endorsements.InvalidSignature.selector);
        e.endorseBySig(address(0), 0, deadline, garbage);
    }

    function test_EndorseBySig_RevertWhen_AlreadyEndorsedDirectly() public {
        vm.prank(alice);
        e.endorse(0);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signEndorse(alicePk, alice, 0, deadline);
        vm.expectRevert(abi.encodeWithSelector(Endorsements.AlreadyEndorsed.selector, alice, 0));
        e.endorseBySig(alice, 0, deadline, sig);
        assertEq(e.nonces(alice), 0, "failed call must not burn the nonce");
    }

    function test_EndorseBySig_SmartWalletViaERC1271() public {
        MockSmartWallet wallet = new MockSmartWallet(bob);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _digest(e, address(wallet), 2, e.nonces(address(wallet)), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bobPk, digest);
        e.endorseBySig(address(wallet), 2, deadline, abi.encode(v, r, s));
        assertTrue(e.hasEndorsed(address(wallet), 2));
    }

    function test_EndorseBySig_SmartWalletRejectsWrongSigner() public {
        MockSmartWallet wallet = new MockSmartWallet(bob);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _digest(e, address(wallet), 2, e.nonces(address(wallet)), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePk, digest);
        vm.expectRevert(Endorsements.InvalidSignature.selector);
        e.endorseBySig(address(wallet), 2, deadline, abi.encode(v, r, s));
    }

    // ── fuzz ────────────────────────────────────────────────────────────────

    function testFuzz_EndorseBySig_AnySignerAnySkill(uint256 pk, uint8 skillSeed, uint32 ttl) public {
        pk = bound(pk, 1, N - 1);
        address signer = vm.addr(pk);
        uint256 skillId = uint256(skillSeed) % 3;
        uint256 deadline = block.timestamp + ttl;
        bytes memory sig = _sign(pk, _digest(e, signer, skillId, e.nonces(signer), deadline));
        vm.prank(relayer);
        e.endorseBySig(signer, skillId, deadline, sig);
        assertTrue(e.hasEndorsed(signer, skillId));
        assertEq(e.nonces(signer), 1);
    }

    function testFuzz_EndorseBySig_WrongKeyAlwaysFails(uint256 pkSigner, uint256 pkClaimed) public {
        pkSigner = bound(pkSigner, 1, N - 1);
        pkClaimed = bound(pkClaimed, 1, N - 1);
        vm.assume(vm.addr(pkSigner) != vm.addr(pkClaimed));
        address claimed = vm.addr(pkClaimed);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(pkSigner, _digest(e, claimed, 0, e.nonces(claimed), deadline));
        vm.expectRevert(Endorsements.InvalidSignature.selector);
        e.endorseBySig(claimed, 0, deadline, sig);
    }

    function testFuzz_EndorseBySig_ExpiryBoundary(uint32 ttl, uint32 elapsed) public {
        uint256 deadline = block.timestamp + ttl;
        bytes memory sig = _signEndorse(alicePk, alice, 0, deadline);
        vm.warp(block.timestamp + elapsed);
        if (block.timestamp > deadline) {
            vm.expectRevert(abi.encodeWithSelector(Endorsements.SignatureExpired.selector, deadline));
        }
        e.endorseBySig(alice, 0, deadline, sig);
    }
}
