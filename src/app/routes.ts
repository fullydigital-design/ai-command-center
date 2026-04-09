import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";

// ── Lazy-loaded page chunks ──
// Each route uses React Router's `lazy` prop so the page JS
// is only downloaded when the user navigates there.

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      {
        index: true,
        lazy: () =>
          import("./components/CommandCenter").then((m) => ({
            Component: m.CommandCenter,
          })),
      },
      {
        path: "training",
        lazy: () =>
          import("./components/TrainingPage").then((m) => ({
            Component: m.TrainingPage,
          })),
      },
      {
        path: "community",
        lazy: () =>
          import("./components/CommunityHubPage").then((m) => ({
            Component: m.CommunityHubPage,
          })),
      },
      {
        path: "packages",
        lazy: () =>
          import("./components/PackageManagerPage").then((m) => ({
            Component: m.PackageManagerPage,
          })),
      },
      {
        path: "settings",
        lazy: () =>
          import("./components/SettingsPage").then((m) => ({
            Component: m.SettingsPage,
          })),
      },
    ],
  },
]);