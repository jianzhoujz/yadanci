import { DeckPicker } from "@/components/DeckPicker";
import { StudyView } from "@/components/StudyView";
import { useTheme } from "@/hooks/useTheme";
import { useStore } from "@/store";

export default function App() {
  useTheme();
  const status = useStore((s) => s.status);

  if (status !== "idle") return <StudyView />;
  return <DeckPicker />;
}
