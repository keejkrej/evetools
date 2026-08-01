import { Chat } from "@/components/chat";
import { BoardProvider } from "@/components/board-context";

export default function Home() {
  return <BoardProvider><Chat /></BoardProvider>;
}
