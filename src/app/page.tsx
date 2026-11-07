import { Dashboard } from "@/components/Dashboard";
import { Guestbook } from "@/components/Guestbook";
import { WalletBar } from "@/components/WalletBar";

const MAIN_SITE = "https://tatas.anxentlab.my.id";

export default function Home() {
  return (
    <div className="site">
      <nav className="nav px" aria-label="Primary">
        <a href={MAIN_SITE} className="t-mono l-muted">
          ← tatas.anxentlab.my.id
        </a>
        <WalletBar />
      </nav>

      <header className="hero px">
        <p className="t-mono c-muted">Onchain · Phase 2</p>
        <h1 className="t-h1">Onchain</h1>
        <p className="t-role hero-sub">
          The Web3 side of my portfolio. Connect a wallet to read your balances across five EVM chains, check which
          dApps can still move your tokens, and leave a message in an on-chain guestbook.
        </p>
      </header>

      <main className="grow">
        <Dashboard />
        <Guestbook />
      </main>

      <footer className="foot px t-mono c-muted">
        <span>No keys, no custody, no tracking. You sign every transaction yourself.</span>
        <a className="l-muted" href={MAIN_SITE}>
          Tatas Handharu
        </a>
      </footer>
    </div>
  );
}
