import { Dashboard } from "@/components/Dashboard";
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
        <p className="t-mono c-muted">Onchain · Phase 1</p>
        <h1 className="t-h1">Onchain</h1>
        <p className="t-role hero-sub">
          The Web3 side of my portfolio. Connect a wallet to read your balances across five EVM chains. Guestbook,
          Sign-In with Ethereum and endorsements are next.
        </p>
      </header>

      <main className="grow">
        <Dashboard />
      </main>

      <footer className="foot px t-mono c-muted">
        <span>Read only. No keys, no custody, no tracking.</span>
        <a className="l-muted" href={MAIN_SITE}>
          Tatas Handharu
        </a>
      </footer>
    </div>
  );
}
