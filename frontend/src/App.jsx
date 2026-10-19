import { Link, NavLink, Route, Routes } from "react-router-dom";
import Flips from "./pages/Flips";
import Spread from "./pages/Spread";
import Sets from "./pages/Sets";
import "./App.css";

export default function App() {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="wordmark">Warframe Flips</Link>
          <nav className="tabs">
            <NavLink to="/" end>Mod flips</NavLink>
            <NavLink to="/spread">Spread history</NavLink>
            <NavLink to="/sets">Sets vs parts</NavLink>
          </nav>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Flips />} />
        <Route path="/spread" element={<Spread />} />
        <Route path="/sets" element={<Sets />} />
      </Routes>
    </>
  );
}