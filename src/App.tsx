import { useEffect, useState } from "react";
import {
  AmmoraDataApiClient,
  buildCreateALCSegmentedV3LaunchWithTokenConfig,
} from "@ammora-protocol/sdk";
import { createWalletClient, custom, parseEther, type Address, type Hex } from "viem";

const GIWA_SEPOLIA_CHAIN_ID = 91_342n;
const GIWA_SEPOLIA_HEX = "0x164ce"; // 91342 in hex
const DATA_API_URL = "https://ammora-giwa-sepolia-data.fly.dev";

const dataApi = new AmmoraDataApiClient(DATA_API_URL);

declare global {
  interface Window {
    ethereum?: any;
  }
}

function normalizeLaunches(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.launches)) return res.launches;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

function shortAddr(addr?: string) {
  if (!addr || addr.length < 12) return addr || "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"explore" | "launch">("explore");

  // Wallet state
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  // Explore launches state
  const [launches, setLaunches] = useState<any[]>([]);
  const [loadingLaunches, setLoadingLaunches] = useState(false);
  const [launchesError, setLaunchesError] = useState<string | null>(null);
  const [searchToken, setSearchToken] = useState("");
  const [singleLaunch, setSingleLaunch] = useState<any | null>(null);

  // Launch builder form state
  const [tokenName, setTokenName] = useState("Demo GIWA Token");
  const [tokenSymbol, setTokenSymbol] = useState("DGT");
  const [tokenUri, setTokenUri] = useState("ipfs://token-metadata");
  const [creatorUri, setCreatorUri] = useState("ipfs://creator-metadata");
  const [configId, setConfigId] = useState("1");
  const [decimals, setDecimals] = useState("9");
  const [poolFeeEth, setPoolFeeEth] = useState("0.001");
  const [factoryAddress, setFactoryAddress] = useState("");

  const [builtTx, setBuiltTx] = useState<{ data: Hex; value: bigint } | null>(null);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [sendingTx, setSendingTx] = useState(false);

  async function fetchLaunches() {
    setLoadingLaunches(true);
    setLaunchesError(null);
    try {
      const res = await dataApi.getLaunches({ chainId: GIWA_SEPOLIA_CHAIN_ID });
      setLaunches(normalizeLaunches(res));
    } catch (err: any) {
      setLaunchesError(err?.message || "Failed to load launches from Ammora Data API.");
    } finally {
      setLoadingLaunches(false);
    }
  }

  useEffect(() => {
    fetchLaunches();
  }, []);

  async function handleSearchToken() {
    if (!searchToken.trim()) return;
    setLaunchesError(null);
    setSingleLaunch(null);
    try {
      const res = await dataApi.getLaunch(
        GIWA_SEPOLIA_CHAIN_ID,
        searchToken.trim() as Address
      );
      setSingleLaunch(res);
    } catch (err: any) {
      setLaunchesError(err?.message || "Launch not found for this token address.");
    }
  }

  async function connectWallet() {
    setWalletError(null);
    if (!window.ethereum) {
      setWalletError("No EVM wallet detected. Install MetaMask or Rabby.");
      return;
    }
    try {
      const accounts: Address[] = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const currentChain: string = await window.ethereum.request({
        method: "eth_chainId",
      });
      setAccount(accounts[0] || null);
      setChainId(currentChain);
    } catch (err: any) {
      setWalletError(err?.message || "Wallet connection cancelled.");
    }
  }

  async function switchToGiwa() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: GIWA_SEPOLIA_HEX }],
      });
      setChainId(GIWA_SEPOLIA_HEX);
    } catch (err: any) {
      setWalletError(
        "Could not switch automatically. Make sure GIWA Sepolia (Chain ID 91342) is added to your wallet."
      );
    }
  }

  function handleBuildCalldata() {
    setBuilderError(null);
    setBuiltTx(null);
    setTxHash(null);
    try {
      const parsedConfigId = BigInt(configId.trim());
      const parsedDecimals = Number(decimals);
      const parsedFee = parseEther(poolFeeEth.trim() || "0");

      const tx = buildCreateALCSegmentedV3LaunchWithTokenConfig(
        tokenName.trim(),
        tokenSymbol.trim(),
        tokenUri.trim(),
        creatorUri.trim(),
        parsedConfigId as any,
        parsedDecimals,
        parsedFee
      );

      setBuiltTx({
        data: tx.data as Hex,
        value: (tx.value ?? parsedFee) as bigint,
      });
    } catch (err: any) {
      setBuilderError(err?.message || "Failed to build launch calldata.");
    }
  }

  async function handleSendLaunchTx() {
    if (!builtTx || !account || !window.ethereum) return;
    if (!factoryAddress.startsWith("0x") || factoryAddress.length !== 42) {
      setBuilderError("Enter a valid 0x Launch Factory address from the GIWA manifest.");
      return;
    }

    setSendingTx(true);
    setBuilderError(null);
    setTxHash(null);

    try {
      const walletClient = createWalletClient({
        transport: custom(window.ethereum),
      });

      const hash = await walletClient.sendTransaction({
        account,
        to: factoryAddress as Address,
        data: builtTx.data,
        value: builtTx.value,
        chain: null,
      });

      setTxHash(hash);
    } catch (err: any) {
      setBuilderError(err?.shortMessage || err?.message || "Transaction failed.");
    } finally {
      setSendingTx(false);
    }
  }

  const isGiwa = chainId?.toLowerCase() === GIWA_SEPOLIA_HEX;

  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <h1>Ammora Mini Launchpad</h1>
          <span className="badge">Powered by @ammora-protocol/sdk v0.3.9 • GIWA Sepolia</span>
        </div>

        <div className="row" style={{ marginTop: 0 }}>
          {account ? (
            <>
              {!isGiwa && (
                <button className="btn btn-secondary" onClick={switchToGiwa}>
                  Switch to GIWA (91342)
                </button>
              )}
              <button className="btn btn-secondary mono">
                {shortAddr(account)} {isGiwa ? "● GIWA" : ""}
              </button>
            </>
          ) : (
            <button className="btn" onClick={connectWallet}>
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {walletError && <div className="alert alert-error">{walletError}</div>}

      <div className="tabs">
        <button
          className={`tab ${activeTab === "explore" ? "active" : ""}`}
          onClick={() => setActiveTab("explore")}
        >
          Explore Launches
        </button>
        <button
          className={`tab ${activeTab === "launch" ? "active" : ""}`}
          onClick={() => setActiveTab("launch")}
        >
          Create Launch (SDK Builder)
        </button>
      </div>

      {activeTab === "explore" && (
        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <h2>Live GIWA Sepolia Launches</h2>
              <p className="muted">
                Indexed via <code>AmmoraDataApiClient</code> (Chain ID: 91342)
              </p>
            </div>
            <button className="btn btn-secondary" onClick={fetchLaunches} disabled={loadingLaunches}>
              {loadingLaunches ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="row">
            <input
              style={{
                flex: 1,
                minWidth: 220,
                background: "#0b0e14",
                border: "1px solid #232b3b",
                color: "#e6edf7",
                padding: "10px 12px",
                borderRadius: 8,
              }}
              placeholder="Search by token address (0x...)"
              value={searchToken}
              onChange={(e) => setSearchToken(e.target.value)}
            />
            <button className="btn" onClick={handleSearchToken}>
              Lookup Token
            </button>
          </div>

          {launchesError && <div className="alert alert-error">{launchesError}</div>}

          {singleLaunch && (
            <div className="code-box">
              <div className="muted" style={{ marginBottom: 6 }}>
                Single Launch Lookup Result:
              </div>
              <pre className="mono">
                {JSON.stringify(
                  singleLaunch,
                  (_, v) => (typeof v === "bigint" ? v.toString() : v),
                  2
                )}
              </pre>
            </div>
          )}

          {loadingLaunches ? (
            <p className="muted" style={{ marginTop: 20 }}>
              Fetching launches from Ammora Data API...
            </p>
          ) : launches.length === 0 ? (
            <p className="muted" style={{ marginTop: 20 }}>
              No launches returned yet on GIWA Sepolia.
            </p>
          ) : (
            <div className="grid">
              {launches.map((item, idx) => {
                const name = item?.name || item?.tokenName || `Launch #${idx + 1}`;
                const symbol = item?.symbol || item?.tokenSymbol || "";
                const tokenAddr = item?.tokenAddress || item?.token || item?.address;
                const status = item?.status || item?.phase || "Active";

                return (
                  <div className="launch-item" key={tokenAddr || idx}>
                    <strong>
                      {name} {symbol ? `(${symbol})` : ""}
                    </strong>
                    <span className="muted">Status: {String(status)}</span>
                    <span className="mono muted">Token: {shortAddr(tokenAddr)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === "launch" && (
        <section className="card">
          <h2>Build Segmented V3 Token Launch</h2>
          <p className="muted">
            Generates unsigned EVM calldata using{" "}
            <code>buildCreateALCSegmentedV3LaunchWithTokenConfig</code> from{" "}
            <code>@ammora-protocol/sdk</code>.
          </p>

          <div className="form-grid">
            <div className="field">
              <label>Token Name</label>
              <input value={tokenName} onChange={(e) => setTokenName(e.target.value)} />
            </div>
            <div className="field">
              <label>Token Symbol</label>
              <input value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value)} />
            </div>
            <div className="field">
              <label>Token Metadata URI</label>
              <input value={tokenUri} onChange={(e) => setTokenUri(e.target.value)} />
            </div>
            <div className="field">
              <label>Creator Metadata URI</label>
              <input value={creatorUri} onChange={(e) => setCreatorUri(e.target.value)} />
            </div>
            <div className="field">
              <label>Config ID</label>
              <input value={configId} onChange={(e) => setConfigId(e.target.value)} />
            </div>
            <div className="field">
              <label>Decimals (6–9)</label>
              <input value={decimals} onChange={(e) => setDecimals(e.target.value)} />
            </div>
            <div className="field">
              <label>Pool Creation Fee (ETH)</label>
              <input value={poolFeeEth} onChange={(e) => setPoolFeeEth(e.target.value)} />
            </div>
            <div className="field">
              <label>GIWA Launch Factory Address (Optional for Build)</label>
              <input
                placeholder="0x..."
                value={factoryAddress}
                onChange={(e) => setFactoryAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="row">
            <button className="btn" onClick={handleBuildCalldata}>
              Build Launch Calldata
            </button>

            {builtTx && (
              <button
                className="btn btn-secondary"
                onClick={handleSendLaunchTx}
                disabled={!account || sendingTx}
              >
                {sendingTx ? "Sending..." : "Send Transaction on GIWA Sepolia"}
              </button>
            )}
          </div>

          {builderError && <div className="alert alert-error">{builderError}</div>}

          {txHash && (
            <div className="alert alert-success mono">
              Transaction submitted! Hash: {txHash}
            </div>
          )}

          {builtTx && (
            <div className="code-box">
              <div className="muted" style={{ marginBottom: 6 }}>
                Encoded Calldata (Value: {builtTx.value.toString()} wei):
              </div>
              <div className="mono">{builtTx.data}</div>
            </div>
          )}
        </section>
      )}

      <footer className="footer">
        Beta Testnet App • GIWA Sepolia (Chain ID 91342) • Built with @ammora-protocol/sdk &amp; viem
      </footer>
    </div>
  );
}
