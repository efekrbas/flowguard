"use client";

import { useWallet } from "./WalletProvider";

export default function WalletButton() {
  const { isConnected, publicKey, connecting, error, connect, disconnect } =
    useWallet();

  if (isConnected && publicKey) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-sm font-mono text-emerald-400">
            {publicKey.slice(0, 4)}...{publicKey.slice(-4)}
          </span>
        </div>
        <button
          onClick={disconnect}
          className="px-3 py-2 text-sm rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={connect}
        disabled={connecting}
        className="group relative px-6 py-2.5 rounded-xl font-semibold text-sm text-white
                   bg-gradient-to-r from-violet-600 to-indigo-600
                   hover:from-violet-500 hover:to-indigo-500
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-300 shadow-lg shadow-violet-500/20
                   hover:shadow-violet-500/40 cursor-pointer"
      >
        <span className="flex items-center gap-2">
          {connecting ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Connecting...
            </>
          ) : (
            <>
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3"
                />
              </svg>
              Connect Wallet
            </>
          )}
        </span>
      </button>
      {error && (
        <p className="text-xs text-red-400 max-w-[220px] text-right">
          {error}
        </p>
      )}
    </div>
  );
}
