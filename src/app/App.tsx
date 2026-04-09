import { RouterProvider } from "react-router";
import { router } from "./routes";
import { ThemeProvider } from "./hooks/useTheme";
import { DataSourceIndicator } from "./components/DataSourceIndicator";

export default function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
      <DataSourceIndicator />
    </ThemeProvider>
  );
}
