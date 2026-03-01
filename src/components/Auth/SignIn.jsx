import { useState } from "react";
import {
  LightbulbIcon,
  CircleNotchIcon as Loader2Icon,
  XIcon,
  EnvelopeSimpleIcon,
  LockIcon,
} from "@phosphor-icons/react";
import { useAuth } from "../../contexts/AuthContext.jsx";

const GoogleIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const SignIn = ({ onClose }) => {
  const { handleGoogleSignIn, signInWithEmail, signUpWithEmail } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [successMsg, setSuccessMsg] = useState(null);

  const onGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    const result = await handleGoogleSignIn();
    if (result.success) {
      onClose?.();
    } else {
      setIsLoading(false);
      setErrorMsg(result.message);
    }
  };

  const onEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const result = isSignUp
      ? await signUpWithEmail(email, password)
      : await signInWithEmail(email, password);

    if (result.success) {
      if (isSignUp) {
        setSuccessMsg(result.message);
        setIsLoading(false);
      } else {
        onClose?.();
      }
    } else {
      setIsLoading(false);
      setErrorMsg(result.message);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      {/* Card */}
      <div
        className="w-full max-w-sm rounded-2xl shadow-lg p-8 flex flex-col items-center gap-6 relative"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1 rounded"
            style={{ color: "var(--color-text-muted)" }}
            title="Close"
          >
            <XIcon size={15} />
          </button>
        )}
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            <LightbulbIcon
              size={24}
              style={{ color: "var(--color-on-primary)" }}
            />
          </div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: "var(--color-text)" }}
          >
            <span style={{ color: "var(--color-primary)", fontWeight: "bold" }}>
              IF
            </span>
            any
          </h1>
          <p
            className="text-sm text-center"
            style={{ color: "var(--color-text-sec)" }}
          >
            Your personal knowledge base
          </p>
        </div>

        <div
          className="w-full h-px"
          style={{ backgroundColor: "var(--color-border-lt)" }}
        />

        {/* Email/Password form */}
        <form onSubmit={onEmailSubmit} className="w-full flex flex-col gap-3">
          <p
            className="text-sm text-center font-medium"
            style={{ color: "var(--color-text-sec)" }}
          >
            {isSignUp ? "Create your account" : "Sign in to access your notes"}
          </p>

          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{
              backgroundColor: "var(--color-input)",
              border: "1.5px solid var(--color-border)",
            }}
          >
            <EnvelopeSimpleIcon
              size={16}
              style={{ color: "var(--color-text-muted)" }}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: "var(--color-text)" }}
            />
          </div>

          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{
              backgroundColor: "var(--color-input)",
              border: "1.5px solid var(--color-border)",
            }}
          >
            <LockIcon size={16} style={{ color: "var(--color-text-muted)" }} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={6}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: "var(--color-text)" }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              backgroundColor: "var(--color-primary)",
              color: "var(--color-primary-dk)",
            }}
          >
            {isLoading ? (
              <Loader2Icon size={18} className="animate-spin" />
            ) : null}
            {isLoading
              ? "Please wait…"
              : isSignUp
                ? "Create Account"
                : "Sign In"}
          </button>
        </form>

        <div className="w-full flex items-center gap-3">
          <div
            className="flex-1 h-px"
            style={{ backgroundColor: "var(--color-border-lt)" }}
          />
          <span
            className="text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            or
          </span>
          <div
            className="flex-1 h-px"
            style={{ backgroundColor: "var(--color-border-lt)" }}
          />
        </div>

        {/* Google sign-in */}
        <button
          type="button"
          onClick={onGoogleSignIn}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 h-12 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            backgroundColor: "white",
            color: "#374151",
            border: "1.5px solid var(--color-border)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          {isLoading ? (
            <Loader2Icon
              size={18}
              className="animate-spin"
              style={{ color: "var(--color-text-muted)" }}
            />
          ) : (
            <GoogleIcon className="w-5 h-5" />
          )}
          Continue with Google
        </button>

        {errorMsg && (
          <p
            className="w-full text-xs text-center px-2 py-2 rounded-lg"
            style={{
              color: "var(--color-danger)",
              backgroundColor: "rgba(220,38,38,0.07)",
              border: "1px solid rgba(220,38,38,0.15)",
            }}
          >
            {errorMsg}
          </p>
        )}

        {successMsg && (
          <p
            className="w-full text-xs text-center px-2 py-2 rounded-lg"
            style={{
              color: "#16a34a",
              backgroundColor: "rgba(22,163,74,0.07)",
              border: "1px solid rgba(22,163,74,0.15)",
            }}
          >
            {successMsg}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setIsSignUp((v) => !v);
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className="text-xs transition-colors"
          style={{ color: "var(--color-text-sec)" }}
        >
          {isSignUp
            ? "Already have an account? Sign in"
            : "Don't have an account? Sign up"}
        </button>

        <p
          className="text-xs text-center"
          style={{ color: "var(--color-text-muted)" }}
        >
          By signing in you agree to our terms of service.
        </p>
      </div>
    </div>
  );
};

export default SignIn;
