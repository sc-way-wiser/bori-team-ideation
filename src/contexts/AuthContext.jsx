/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useNoteStore } from "../store/useNoteStore.js";

// ── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const clearUserState = useNoteStore((s) => s.clearUserState);

  useEffect(() => {
    // Detect if we're returning from an OAuth redirect (hash contains access_token or error)
    const hashParams = window.location.hash;
    const isOAuthCallback =
      hashParams.includes("access_token") ||
      hashParams.includes("error_description");

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        // Wipe all in-memory user data so the next user starts completely clean
        clearUserState();
      }
      setSession(session);
      setIsAuthLoading(false);
    });

    // If this is an OAuth callback, let onAuthStateChange handle session
    // resolution — getSession() may resolve before the hash is consumed.
    if (!isOAuthCallback) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setIsAuthLoading(false);
      });
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/notes`,
        },
      });

      if (error) {
        if (error.message.includes("provider is not enabled")) {
          return {
            success: false,
            error: "provider_not_enabled",
            message: "Google sign-in is not enabled. Please contact support.",
          };
        }
        if (error.message.includes("already registered")) {
          return {
            success: false,
            error: "email_exists",
            message:
              "This email is already registered with a different method.",
          };
        }
        if (
          error.message.toLowerCase().includes("network") ||
          error.message.includes("fetch")
        ) {
          return {
            success: false,
            error: "network_error",
            message:
              "Network error. Please check your connection and try again.",
          };
        }
        return {
          success: false,
          error: "unknown_error",
          message: error.message,
        };
      }

      return { success: true, message: "Redirecting to Google sign-in…" };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      return { success: false, error: "unknown_error", message };
    }
  };

  const signInWithEmail = async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          return {
            success: false,
            error: "invalid_credentials",
            message: "Invalid email or password.",
          };
        }
        return {
          success: false,
          error: "unknown_error",
          message: error.message,
        };
      }
      return { success: true, message: "Signed in successfully!" };
    } catch {
      return {
        success: false,
        error: "network_error",
        message: "Network error. Please try again.",
      };
    }
  };

  const signUpWithEmail = async (email, password) => {
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        if (error.message.includes("already registered")) {
          return {
            success: false,
            error: "email_exists",
            message: "Email already registered. Please sign in.",
          };
        }
        return {
          success: false,
          error: "unknown_error",
          message: error.message,
        };
      }
      return {
        success: true,
        message: "Account created! Check your email to confirm.",
      };
    } catch {
      return {
        success: false,
        error: "network_error",
        message: "Network error. Please try again.",
      };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isAuthLoading,
        handleGoogleSignIn,
        signInWithEmail,
        signUpWithEmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};
