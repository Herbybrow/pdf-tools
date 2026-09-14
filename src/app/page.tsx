import Hero from "@/components/Hero";
import { ToolCards } from "@/components/ToolCards";

export default function Home() {
  return (
    <main className="flex-1 bg-[#faf7f5] dark:bg-slate-900">
      <Hero />
      <ToolCards />
    </main>
  );
}
