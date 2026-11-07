import { createConfig, http, injected } from "wagmi";
import { arbitrum, base, bsc, mainnet, polygon } from "wagmi/chains";

// Optional: set NEXT_PUBLIC_RPC_<CHAIN> in Vercel to use a private RPC (Alchemy, Infura, dRPC).
// Without them the chains' public RPCs are used, which are rate limited but need no key.
const rpc = {
  [mainnet.id]: process.env.NEXT_PUBLIC_RPC_ETHEREUM,
  [base.id]: process.env.NEXT_PUBLIC_RPC_BASE,
  [arbitrum.id]: process.env.NEXT_PUBLIC_RPC_ARBITRUM,
  [polygon.id]: process.env.NEXT_PUBLIC_RPC_POLYGON,
  [bsc.id]: process.env.NEXT_PUBLIC_RPC_BSC,
};

export const config = createConfig({
  chains: [mainnet, base, arbitrum, polygon, bsc],
  // EIP-6963 discovery is on by default, so MetaMask shows up as its own connector (id "io.metamask").
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(rpc[mainnet.id], { batch: true }),
    [base.id]: http(rpc[base.id], { batch: true }),
    [arbitrum.id]: http(rpc[arbitrum.id], { batch: true }),
    [polygon.id]: http(rpc[polygon.id], { batch: true }),
    [bsc.id]: http(rpc[bsc.id], { batch: true }),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
