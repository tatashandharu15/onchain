import type { Address } from "viem";
import { arbitrum, base, bsc, mainnet, polygon } from "viem/chains";

export type ChainMeta = {
  id: number;
  name: string;
  /** DefiLlama chain prefix for token prices */
  llama: string;
  native: { symbol: string; priceKey: string };
  explorer: string;
};

export type Token = {
  chainId: number;
  symbol: string;
  address: Address;
};

export const CHAINS: ChainMeta[] = [
  { id: mainnet.id, name: "Ethereum", llama: "ethereum", native: { symbol: "ETH", priceKey: "coingecko:ethereum" }, explorer: "https://etherscan.io" },
  { id: base.id, name: "Base", llama: "base", native: { symbol: "ETH", priceKey: "coingecko:ethereum" }, explorer: "https://basescan.org" },
  { id: arbitrum.id, name: "Arbitrum", llama: "arbitrum", native: { symbol: "ETH", priceKey: "coingecko:ethereum" }, explorer: "https://arbiscan.io" },
  { id: polygon.id, name: "Polygon", llama: "polygon", native: { symbol: "POL", priceKey: "coingecko:polygon-ecosystem-token" }, explorer: "https://polygonscan.com" },
  { id: bsc.id, name: "BNB Chain", llama: "bsc", native: { symbol: "BNB", priceKey: "coingecko:binancecoin" }, explorer: "https://bscscan.com" },
];

/**
 * Curated list of major tokens per chain. Decimals are read on-chain at runtime,
 * so only the address has to be correct. Full token discovery (any ERC-20, NFTs)
 * comes in phase 2 via an indexer API.
 */
export const TOKENS: Token[] = [
  // Ethereum
  { chainId: mainnet.id, symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  { chainId: mainnet.id, symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  { chainId: mainnet.id, symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" },
  { chainId: mainnet.id, symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  { chainId: mainnet.id, symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" },
  { chainId: mainnet.id, symbol: "LINK", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA" },
  { chainId: mainnet.id, symbol: "UNI", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" },
  // Base
  { chainId: base.id, symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  { chainId: base.id, symbol: "WETH", address: "0x4200000000000000000000000000000000000006" },
  { chainId: base.id, symbol: "DAI", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb" },
  { chainId: base.id, symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" },
  // Arbitrum
  { chainId: arbitrum.id, symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
  { chainId: arbitrum.id, symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" },
  { chainId: arbitrum.id, symbol: "WETH", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" },
  { chainId: arbitrum.id, symbol: "WBTC", address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f" },
  { chainId: arbitrum.id, symbol: "ARB", address: "0x912CE59144191C1204E64559FE8253a0e49E6548" },
  // Polygon
  { chainId: polygon.id, symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
  { chainId: polygon.id, symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" },
  { chainId: polygon.id, symbol: "WETH", address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" },
  { chainId: polygon.id, symbol: "WBTC", address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6" },
  // BNB Chain
  { chainId: bsc.id, symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955" },
  { chainId: bsc.id, symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" },
  { chainId: bsc.id, symbol: "ETH", address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8" },
  { chainId: bsc.id, symbol: "BTCB", address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c" },
];

export const chainMeta = (id: number) => CHAINS.find((c) => c.id === id);

export const tokenPriceKey = (t: Token) => `${chainMeta(t.chainId)!.llama}:${t.address.toLowerCase()}`;

/** Every price key the app may ask for. The price route only ever fetches these. */
export const ALL_PRICE_KEYS = Array.from(
  new Set([...CHAINS.map((c) => c.native.priceKey), ...TOKENS.map(tokenPriceKey)]),
);
