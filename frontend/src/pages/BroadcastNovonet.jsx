import BroadcastPanelCanal from "../components/BroadcastPanelCanal";

const CONFIG = {
  label:    "NOVONET",
  icon:     "🔵",
  accent:   "#0ea5e9",
  gradient: "from-sky-950 via-slate-900 to-slate-950",
};

export default function BroadcastNovonet() {
  return <BroadcastPanelCanal canal="novonet" config={CONFIG} />;
}
