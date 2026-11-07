// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/// @title Endorsements
/// @author Tatas Handharu
/// @notice Visitors endorse skills. An endorsement can be sent directly, or signed off-chain (EIP-712, gasless for
///         the endorser) and submitted by anyone, e.g. a relayer that pays the gas.
/// @dev Replay protection for signed endorsements, layer by layer:
///      - domain separator binds the signature to this chain id and this contract address (EIP-712);
///      - a per-endorser nonce makes every signature single-use, even after unendorse;
///      - a deadline bounds how long a leaked signature stays usable;
///      - one active endorsement per (endorser, skill).
///      SignatureChecker accepts EOA signatures (ECDSA, low-s only) and smart accounts (ERC-1271).
contract Endorsements is Ownable2Step, EIP712, Nonces {
    bytes32 public constant ENDORSE_TYPEHASH =
        keccak256("Endorse(address endorser,uint256 skillId,uint256 nonce,uint256 deadline)");
    uint256 public constant MAX_SKILL_BYTES = 48;

    string[] private _skills;
    mapping(uint256 skillId => uint256) public endorsementCount;
    mapping(address endorser => mapping(uint256 skillId => bool)) public hasEndorsed;

    event SkillAdded(uint256 indexed skillId, string name);
    event Endorsed(address indexed endorser, uint256 indexed skillId, bool viaSignature);
    event Unendorsed(address indexed endorser, uint256 indexed skillId);

    error UnknownSkill(uint256 skillId);
    error InvalidSkillName();
    error AlreadyEndorsed(address endorser, uint256 skillId);
    error NotEndorsed(address endorser, uint256 skillId);
    error SignatureExpired(uint256 deadline);
    error InvalidSignature();

    constructor(address initialOwner) Ownable(initialOwner) EIP712("Tatas Onchain Endorsements", "1") {}

    // ── owner ───────────────────────────────────────────────────────────────

    /// @notice Add a skill that visitors can endorse. Skills cannot be removed, so ids stay stable.
    function addSkill(string calldata name) external onlyOwner returns (uint256 skillId) {
        uint256 len = bytes(name).length;
        if (len == 0 || len > MAX_SKILL_BYTES) revert InvalidSkillName();
        skillId = _skills.length;
        _skills.push(name);
        emit SkillAdded(skillId, name);
    }

    // ── endorse ─────────────────────────────────────────────────────────────

    /// @notice Endorse a skill as msg.sender (the caller pays gas).
    function endorse(uint256 skillId) external {
        _endorse(msg.sender, skillId, false);
    }

    /// @notice Submit an endorsement that `endorser` signed off-chain. Anyone may call this.
    /// @param signature EIP-712 signature over Endorse(endorser, skillId, nonces(endorser), deadline).
    function endorseBySig(address endorser, uint256 skillId, uint256 deadline, bytes calldata signature) external {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(ENDORSE_TYPEHASH, endorser, skillId, _useNonce(endorser), deadline))
        );
        if (!SignatureChecker.isValidSignatureNow(endorser, digest, signature)) revert InvalidSignature();
        _endorse(endorser, skillId, true);
    }

    /// @notice Withdraw your own endorsement.
    function unendorse(uint256 skillId) external {
        if (!hasEndorsed[msg.sender][skillId]) revert NotEndorsed(msg.sender, skillId);
        hasEndorsed[msg.sender][skillId] = false;
        endorsementCount[skillId] -= 1;
        emit Unendorsed(msg.sender, skillId);
    }

    function _endorse(address endorser, uint256 skillId, bool viaSignature) private {
        if (skillId >= _skills.length) revert UnknownSkill(skillId);
        if (hasEndorsed[endorser][skillId]) revert AlreadyEndorsed(endorser, skillId);
        hasEndorsed[endorser][skillId] = true;
        endorsementCount[skillId] += 1;
        emit Endorsed(endorser, skillId, viaSignature);
    }

    // ── views ───────────────────────────────────────────────────────────────

    function skillCount() external view returns (uint256) {
        return _skills.length;
    }

    function skillName(uint256 skillId) external view returns (string memory) {
        if (skillId >= _skills.length) revert UnknownSkill(skillId);
        return _skills[skillId];
    }

    /// @notice All skills with their endorsement counts, plus whether `viewer` endorsed each one.
    function getSkills(address viewer)
        external
        view
        returns (string[] memory names, uint256[] memory counts, bool[] memory endorsedByViewer)
    {
        uint256 n = _skills.length;
        names = new string[](n);
        counts = new uint256[](n);
        endorsedByViewer = new bool[](n);
        for (uint256 i; i < n; ++i) {
            names[i] = _skills[i];
            counts[i] = endorsementCount[i];
            endorsedByViewer[i] = hasEndorsed[viewer][i];
        }
    }

    /// @notice EIP-712 domain separator for this chain and contract (for off-chain tooling).
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
