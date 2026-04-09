import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "../../hooks/useTheme";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: "var(--card)",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
          fontFamily: "'Inter', sans-serif",
          fontSize: "12px",
        },
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--card)",
          "--success-text": "#4ade80",
          "--success-border": "rgba(74,222,128,0.2)",
          "--error-bg": "var(--card)",
          "--error-text": "#f87171",
          "--error-border": "rgba(248,113,113,0.2)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
