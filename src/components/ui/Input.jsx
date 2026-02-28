import { XIcon } from "@phosphor-icons/react";
import { cn } from "../../utils/cn";

const Input = ({ className, showClearButton, onClear, ...props }) => (
  <div className="relative">
    <input
      className={cn(
        "w-full h-10 px-3 rounded text-sm bg-(--color-input) border border-(--color-border)",
        "text-(--color-text) outline-none hover:border-(--color-primary) transition-colors",
        showClearButton && "pr-8",
        className,
      )}
      {...props}
    />
    {showClearButton && (
      <button
        type="button"
        onClick={onClear}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-(--color-text-muted) hover:text-(--color-text)"
      >
        <XIcon size={14} />
      </button>
    )}
  </div>
);

export default Input;
