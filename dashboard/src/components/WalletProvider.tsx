"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { WalletState } from "@/types";

// ────────────────────────────────────────────────────────────────────────────────
// Wallet Context
// ────────────────────────────────────────────────────────────────────────────────

interface WalletContextType extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function useWallet(): WalletContextType {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within a <WalletProvider>");
  }
  return ctx;
}

// ────────────────────────────────────────────────────────────────────────────────
// Wallet Provider Component
// ────────────────────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    publicKey: null,
    isFreighterInstalled: false,
    connecting: false,
    error: null,
  });

  // Check if Freighter is installed on mount.
  useEffect(() => {
    async function checkFreighter() {
      try {
        const freighterApi = await import("@stellar/freighter-api");
        const { isConnected } = await freighterApi.isConnected();
        setState((prev) => ({
          ...prev,
          isFreighterInstalled: isConnected,
        }));
      } catch {
        setState((prev) => ({ ...prev, isFreighterInstalled: false }));
      }
    }
    checkFreighter();
  }, []);

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, connecting: true, error: null }));

    try {
      const freighterApi = await import("@stellar/freighter-api");

      const { isConnected } = await freighterApi.isConnected();
      if (!isConnected) {
        setState((prev) => ({
          ...prev,
          connecting: false,
          error:
            "Freighter wallet not detected. Please install it from freighter.app",
        }));
        return;
      }

      const accessResult = await freighterApi.requestAccess();

      if (accessResult.error) {
        setState((prev) => ({
          ...prev,
          connecting: false,
          error: `Access denied: ${accessResult.error}`,
        }));
        return;
      }

      setState({
        isConnected: true,
        publicKey: accessResult.address,
        isFreighterInstalled: true,
        connecting: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        connecting: false,
        error:
          err instanceof Error ? err.message : "Failed to connect wallet",
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({
      isConnected: false,
      publicKey: null,
      isFreighterInstalled: true,
      connecting: false,
      error: null,
    });
  }, []);

  return (
    <WalletContext.Provider value={{ ...state, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}
