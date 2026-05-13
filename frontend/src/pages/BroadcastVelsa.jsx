import BroadcastPanelCanal from "../components/BroadcastPanelCanal";

const CONFIG = {
  label:    "VELSA",
  icon:     "🟣",
  accent:   "#a855f7",
  gradient: "from-purple-950 via-slate-900 to-slate-950",
};

export default function BroadcastVelsa() {
  return <BroadcastPanelCanal canal="velsa" config={CONFIG} />;
}
