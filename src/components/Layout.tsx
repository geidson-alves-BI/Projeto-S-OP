import { Outlet } from "react-router-dom";
import TopNav from "./TopNav";
import DesktopUpdatePanel from "./DesktopUpdatePanel";

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1">
        <Outlet />
      </main>
      <DesktopUpdatePanel />
    </div>
  );
}
