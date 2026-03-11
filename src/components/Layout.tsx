import { Outlet } from "react-router-dom";
import TopNav from "./TopNav";
import ExecutiveChatWidget from "./ExecutiveChatWidget";
import RouteErrorBoundary from "./RouteErrorBoundary";

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopNav />
      <main className="flex-1 relative">
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </main>
      <ExecutiveChatWidget />
    </div>
  );
}
