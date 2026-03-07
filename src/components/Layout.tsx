import { Outlet } from "react-router-dom";
import TopNav from "./TopNav";
import DesktopUpdatePanel from "./DesktopUpdatePanel";

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopNav />
      <main className="flex-1 relative">
        <Outlet />
      </main>
      <DesktopUpdatePanel />
    </div>
  );
}
