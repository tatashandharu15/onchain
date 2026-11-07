// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface IGuestbook {
    function lastSignedAt(address author) external view returns (uint256);
}

/// @notice ERC-5192 minimal soulbound interface.
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    function locked(uint256 tokenId) external view returns (bool);
}

/// @title VisitorBadge
/// @author Tatas Handharu
/// @notice A soulbound (non-transferable) badge for anyone who signed the Guestbook. One per address, self-minted.
/// @dev Eligibility is read live from the Guestbook contract, so no allowlist or owner action is needed.
///      Metadata and artwork are fully on-chain and contain no user-supplied text.
///      Holders may burn their badge (and mint again later); transfers and approvals always revert.
contract VisitorBadge is ERC721, IERC5192 {
    using Strings for uint256;
    using Strings for address;

    IGuestbook public immutable guestbook;

    uint256 private _lastId;
    uint256 private _burned;
    mapping(address holder => uint256 tokenId) public badgeOf;
    mapping(uint256 tokenId => uint64) public mintedAt;

    error Soulbound();
    error NotEligible(address account);
    error AlreadyMinted(address account, uint256 tokenId);
    error NotHolder(address account, uint256 tokenId);

    constructor(IGuestbook guestbook_) ERC721("Onchain Visitor Badge", "VISIT") {
        guestbook = guestbook_;
    }

    // ── mint / burn ─────────────────────────────────────────────────────────

    /// @notice Mint your badge. Requires at least one Guestbook entry from msg.sender.
    function mint() external returns (uint256 tokenId) {
        if (guestbook.lastSignedAt(msg.sender) == 0) revert NotEligible(msg.sender);
        uint256 existing = badgeOf[msg.sender];
        if (existing != 0) revert AlreadyMinted(msg.sender, existing);

        tokenId = ++_lastId;
        badgeOf[msg.sender] = tokenId;
        mintedAt[tokenId] = uint64(block.timestamp);
        // _mint, not _safeMint: no receiver callback, so no reentrancy surface. The minter is msg.sender itself.
        _mint(msg.sender, tokenId);
        emit Locked(tokenId);
    }

    /// @notice Burn your own badge.
    function burn(uint256 tokenId) external {
        if (_ownerOf(tokenId) != msg.sender) revert NotHolder(msg.sender, tokenId);
        delete badgeOf[msg.sender];
        delete mintedAt[tokenId];
        _burned += 1;
        _burn(tokenId);
    }

    // ── soulbound ───────────────────────────────────────────────────────────

    /// @dev Only mint (from == 0) and burn (to == 0) may move a token.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    /// @inheritdoc IERC5192
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }

    // ── views ───────────────────────────────────────────────────────────────

    function totalSupply() external view returns (uint256) {
        return _lastId - _burned;
    }

    function totalMinted() external view returns (uint256) {
        return _lastId;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        address holder = _requireOwned(tokenId);
        string memory id = tokenId.toString();
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
            '<rect width="400" height="400" fill="#f4f3ef"/>',
            '<rect x="16" y="16" width="368" height="368" fill="none" stroke="#0a0a0a"/>',
            '<text x="36" y="64" font-family="monospace" font-size="14" fill="#6e6d69">ONCHAIN VISITOR</text>',
            '<text x="32" y="250" font-family="sans-serif" font-size="104" fill="#0a0a0a">#',
            id,
            "</text>",
            '<text x="36" y="300" font-family="monospace" font-size="11" fill="#6e6d69">',
            holder.toHexString(),
            "</text>",
            '<text x="36" y="356" font-family="monospace" font-size="12" fill="#0a0a0a">tatas.anxentlab.my.id</text>',
            "</svg>"
        );
        string memory json = string.concat(
            '{"name":"Onchain Visitor #',
            id,
            '","description":"Soulbound badge for signing the on-chain guestbook at onchain.tatas.anxentlab.my.id. Non-transferable (ERC-5192).",',
            '"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '","attributes":[{"trait_type":"Minted","display_type":"date","value":',
            uint256(mintedAt[tokenId]).toString(),
            '},{"trait_type":"Soulbound","value":"Yes"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }
}
