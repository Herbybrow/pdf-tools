import { Alex_Brush, Caveat, Dancing_Script, Great_Vibes } from "next/font/google";

const caveat = Caveat({ subsets: ["latin"], weight: "600" });
const dancingScript = Dancing_Script({ subsets: ["latin"], weight: "700" });
const greatVibes = Great_Vibes({ subsets: ["latin"], weight: "400" });
const alexBrush = Alex_Brush({ subsets: ["latin"], weight: "400" });

export type SignatureFontOption = { id: string; label: string; className: string; cssFamily: string };

export const SIGNATURE_FONTS: SignatureFontOption[] = [
  { id: "caveat", label: "Caveat", className: caveat.className, cssFamily: caveat.style.fontFamily },
  { id: "dancing-script", label: "Dancing Script", className: dancingScript.className, cssFamily: dancingScript.style.fontFamily },
  { id: "great-vibes", label: "Great Vibes", className: greatVibes.className, cssFamily: greatVibes.style.fontFamily },
  { id: "alex-brush", label: "Alex Brush", className: alexBrush.className, cssFamily: alexBrush.style.fontFamily },
];
