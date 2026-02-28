import { cn } from "../../utils/cn";

const Button = ({ className, children, ...props }) => (
  <button
    className={cn(
      "inline-flex items-center justify-center px-4 py-2 rounded text-sm font-medium transition-colors",
      "bg-(--color-primary) text-(--color-primary-dk) hover:bg-(--color-primary-hv)",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

export default Button;
