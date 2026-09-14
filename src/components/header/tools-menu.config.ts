import {
  Combine,
  Crop,
  EyeOff,
  FileCheck2,
  FileCode2,
  FileMinus,
  FileOutput,
  FilePenLine,
  FileText,
  FileType,
  GitCompare,
  Globe,
  Hash,
  Image as ImageIcon,
  LayoutGrid,
  Lock,
  Minimize2,
  PenLine,
  Presentation,
  RotateCw,
  ScanLine,
  ScanText,
  Scissors,
  Sheet,
  Table2,
  Unlock,
  Workflow,
  Wrench,
} from "lucide-react";
import type { ToolsMenuCategory, ToolsMenuConfig, ToolsMenuItem } from "./types";

const icon = {
  jpg: "text-sky-500",
  word: "text-[#2b579a]",
  ppt: "text-[#c43e1c]",
  excel: "text-[#217346]",
  html: "text-orange-500",
  pdf: "text-[#e5322d]",
  organize: "text-[#e5322d]",
  optimize: "text-emerald-600",
  edit: "text-violet-600",
  security: "text-slate-600",
  intelligence: "text-indigo-500",
} as const;

export const CONVERT_TO_PDF: ToolsMenuCategory = {
  title: "Convert to PDF",
  items: [
    { label: "JPG to PDF", labelSw: "JPG kuwa PDF", icon: ImageIcon, href: "/tools/jpg-to-pdf", iconClassName: icon.jpg },
    { label: "Word to PDF", labelSw: "Word kuwa PDF", icon: FileType, href: "/tools/word-to-pdf", iconClassName: icon.word },
    { label: "PowerPoint to PDF", labelSw: "PowerPoint kuwa PDF", icon: Presentation, href: "/tools/powerpoint-to-pdf", iconClassName: icon.ppt },
    { label: "Excel to PDF", labelSw: "Excel kuwa PDF", icon: Sheet, href: "/tools/excel-to-pdf", iconClassName: icon.excel },
    { label: "HTML to PDF", labelSw: "HTML kuwa PDF", icon: Globe, href: "/tools/html-to-pdf", iconClassName: icon.html },
  ],
};

export const CONVERT_FROM_PDF: ToolsMenuCategory = {
  title: "Convert from PDF",
  items: [
    { label: "PDF to JPG", labelSw: "PDF kuwa JPG", icon: ImageIcon, href: "/tools/pdf-to-jpg", iconClassName: icon.jpg },
    {
      label: "PDF to Word",
      labelSw: "PDF kuwa Word",
      icon: FileText,
      href: "/tools/pdf-to-word",
      iconClassName: icon.word,
      popular: true,
    },
    { label: "PDF to PowerPoint", labelSw: "PDF kuwa PowerPoint", icon: Presentation, href: "/tools/pdf-to-powerpoint", iconClassName: icon.ppt },
    { label: "PDF to Excel", labelSw: "PDF kuwa Excel", icon: Table2, href: "/tools/pdf-to-excel", iconClassName: icon.excel },
    { label: "PDF to PDF/A", labelSw: "PDF kuwa PDF/A", icon: FileCheck2, href: "/tools/pdf-to-pdfa", iconClassName: icon.pdf },
    { label: "PDF to Markdown", labelSw: "PDF kuwa Markdown", icon: FileCode2, href: "/tools/pdf-to-markdown", iconClassName: icon.pdf },
  ],
};

export const ORGANIZE_PDF: ToolsMenuCategory = {
  title: "Organize PDF",
  items: [
    { label: "Merge PDF", labelSw: "Unganisha PDF", icon: Combine, href: "/tools/merge-pdf", iconClassName: icon.organize },
    { label: "Split PDF", labelSw: "Gawanya PDF", icon: Scissors, href: "/tools/split-pdf", iconClassName: icon.organize },
    { label: "Remove pages", labelSw: "Ondoa kurasa", icon: FileMinus, href: "/tools/remove-pages", iconClassName: icon.organize },
    { label: "Extract pages", labelSw: "Toa kurasa", icon: FileOutput, href: "/tools/extract-pages", iconClassName: icon.organize },
    { label: "Organize PDF", labelSw: "Panga PDF", icon: LayoutGrid, href: "/tools/organize-pdf", iconClassName: icon.organize },
    { label: "Scan to PDF", labelSw: "Piga Skani hadi PDF", icon: ScanLine, href: "/tools/scan-to-pdf", iconClassName: icon.organize },
  ],
};

export const OPTIMIZE_PDF: ToolsMenuCategory = {
  title: "Optimize PDF",
  items: [
    { label: "Compress PDF", labelSw: "Punguza Ukubwa wa PDF", icon: Minimize2, href: "/tools/compress-pdf", iconClassName: icon.optimize },
    { label: "Repair PDF", labelSw: "Tengeneza PDF", icon: Wrench, href: "/tools/repair-pdf", iconClassName: icon.optimize },
    { label: "OCR PDF", labelSw: "Soma Maandishi ya PDF (OCR)", icon: ScanText, href: "/tools/ocr-pdf", iconClassName: icon.optimize },
  ],
};

export const EDIT_PDF: ToolsMenuCategory = {
  title: "Edit PDF",
  items: [
    { label: "Rotate PDF", labelSw: "Zungusha PDF", icon: RotateCw, href: "/tools/rotate-pdf", iconClassName: icon.edit },
    { label: "Add page numbers", labelSw: "Ongeza namba za kurasa", icon: Hash, href: "/tools/add-page-numbers", iconClassName: icon.edit },
    { label: "Add watermark", labelSw: "Ongeza alama ya maji", icon: FilePenLine, href: "/tools/add-watermark", iconClassName: icon.edit },
    { label: "Crop PDF", labelSw: "Pogoa PDF", icon: Crop, href: "/tools/crop-pdf", iconClassName: icon.edit },
    { label: "Edit PDF", labelSw: "Hariri PDF", icon: PenLine, href: "/tools/edit-pdf", iconClassName: icon.edit },
    { label: "PDF Forms", labelSw: "Fomu za PDF", icon: FileText, href: "/tools/pdf-forms", iconClassName: icon.edit },
  ],
};

export const PDF_SECURITY: ToolsMenuCategory = {
  title: "PDF Security",
  items: [
    { label: "Unlock PDF", labelSw: "Fungua PDF", icon: Unlock, href: "/tools/unlock-pdf", iconClassName: icon.security },
    { label: "Protect PDF", labelSw: "Linda PDF", icon: Lock, href: "/tools/protect-pdf", iconClassName: icon.security },
    { label: "Sign PDF", labelSw: "Tia Sahihi PDF", icon: PenLine, href: "/tools/sign-pdf", iconClassName: icon.security },
    { label: "Redact PDF", labelSw: "Ondoa Taarifa Nyeti (PDF)", icon: EyeOff, href: "/tools/redact-pdf", iconClassName: icon.security },
    { label: "Compare PDF", labelSw: "Linganisha PDF", icon: GitCompare, href: "/tools/compare-pdf", iconClassName: icon.security },
  ],
};

export const AUTOMATION: ToolsMenuCategory = {
  title: "Automation",
  items: [
    { label: "Workflow Pipeline", labelSw: "Mtiririko wa Kazi", icon: Workflow, href: "/tools/workflow-pipeline", iconClassName: icon.intelligence },
  ],
};

export const CATEGORY_TITLES_SW: Record<string, string> = {
  "Convert to PDF": "Badilisha kuwa PDF",
  "Convert from PDF": "Badilisha kutoka PDF",
  "Organize PDF": "Panga PDF",
  "Optimize PDF": "Boresha PDF",
  "Edit PDF": "Hariri PDF",
  "PDF Security": "Usalama wa PDF",
  Automation: "Otomatiki",
};

export const CONVERT_PDF_MENU: ToolsMenuConfig = [CONVERT_TO_PDF, CONVERT_FROM_PDF];

export const ALL_PDF_TOOLS_MENU: ToolsMenuConfig = [
  ORGANIZE_PDF,
  OPTIMIZE_PDF,
  CONVERT_TO_PDF,
  CONVERT_FROM_PDF,
  EDIT_PDF,
  PDF_SECURITY,
  AUTOMATION,
];

export const TOOL_CARD_COPY: Record<string, { description: string; descriptionSw?: string; badge?: string }> = {
  "/tools/merge-pdf": {
    description: "Combine PDFs in the order you want with the easiest PDF merger available.",
    descriptionSw: "Unganisha faili za PDF kwa mpangilio unaotaka kwa njia rahisi zaidi.",
  },
  "/tools/split-pdf": {
    description: "Separate one page or a whole set for easy conversion into independent PDF files.",
    descriptionSw: "Tenganisha ukurasa mmoja au kundi zima kuwa faili huru za PDF.",
  },
  "/tools/compress-pdf": {
    description: "Reduce file size while optimizing for maximal PDF quality.",
    descriptionSw: "Punguza ukubwa wa faili huku ukidumisha ubora wa juu wa PDF.",
  },
  "/tools/remove-pages": {
    description: "Delete extra pages from a PDF and keep only the ones you need.",
    descriptionSw: "Futa kurasa zisizohitajika kwenye PDF na baki na zile unazohitaji.",
  },
  "/tools/extract-pages": {
    description: "Extract specific pages from a PDF into a new file.",
    descriptionSw: "Toa kurasa maalum kutoka kwa PDF na uzifanye faili mpya.",
  },
  "/tools/organize-pdf": {
    description: "Sort pages of your PDF as you like. Delete PDF pages or add PDF pages to your document at your convenience.",
    descriptionSw: "Panga kurasa za PDF yako upendavyo. Futa au ongeza kurasa kwenye hati yako kwa urahisi.",
  },
  "/tools/scan-to-pdf": {
    description: "Capture documents from your mobile device and save them instantly to your computer.",
    descriptionSw: "Piga picha za hati kwa kutumia kamera yako na uzihifadhi papo hapo kwenye kompyuta.",
  },
  "/tools/repair-pdf": {
    description: "Repair a damaged PDF and recover data from corrupt PDF. Fix PDF files with the Repair tool.",
    descriptionSw: "Tengeneza PDF iliyoharibika na urejeshe taarifa zake. Rekebisha faili za PDF kwa kutumia zana hii.",
  },
  "/tools/ocr-pdf": {
    description: "Easily convert scanned PDF into searchable and selectable documents.",
    descriptionSw: "Badilisha PDF iliyopigwa picha kuwa hati inayoweza kutafutwa na kuchagua maandishi.",
  },
  "/tools/jpg-to-pdf": {
    description: "Convert JPG images to PDF in seconds. Easily adjust orientation and margins.",
    descriptionSw: "Badilisha picha za JPG kuwa PDF kwa sekunde chache. Rekebisha mwelekeo na pambizo kwa urahisi.",
  },
  "/tools/word-to-pdf": {
    description: "Make DOC and DOCX files easy to read by converting them to PDF.",
    descriptionSw: "Rahisisha usomaji wa faili za DOC na DOCX kwa kuzibadilisha kuwa PDF.",
  },
  "/tools/powerpoint-to-pdf": {
    description: "Make PPT and PPTX slideshows easy to view by converting them to PDF.",
    descriptionSw: "Rahisisha uonyeshaji wa slaidi za PPT na PPTX kwa kuzibadilisha kuwa PDF.",
  },
  "/tools/excel-to-pdf": {
    description: "Make EXCEL spreadsheets easy to read by converting them to PDF.",
    descriptionSw: "Rahisisha usomaji wa majedwali ya EXCEL kwa kuyabadilisha kuwa PDF.",
  },
  "/tools/html-to-pdf": {
    description: "Convert webpages in HTML to PDF. Copy and paste the URL of the page you want and convert it to PDF with a click.",
    descriptionSw: "Badilisha kurasa za tovuti (HTML) kuwa PDF. Bandika kiungo cha ukurasa unaotaka na ubadilishe kuwa PDF kwa kubofya tu.",
  },
  "/tools/pdf-to-jpg": {
    description: "Convert each PDF page into a JPG or extract all images contained in a PDF.",
    descriptionSw: "Badilisha kila ukurasa wa PDF kuwa picha ya JPG, au toa picha zote zilizomo ndani ya PDF.",
  },
  "/tools/pdf-to-word": {
    description: "Easily convert your PDF files into easy to edit DOC and DOCX documents. This is a completely free tool.",
    descriptionSw: "Badilisha faili zako za PDF kuwa hati za DOC na DOCX zinazoweza kuhaririwa kwa urahisi. Zana hii ni bure kabisa.",
  },
  "/tools/pdf-to-powerpoint": {
    description: "Turn your PDF files into easy to edit PPT and PPTX slideshows.",
    descriptionSw: "Badilisha faili zako za PDF kuwa slaidi za PPT na PPTX zinazoweza kuhaririwa kwa urahisi.",
  },
  "/tools/pdf-to-excel": {
    description: "Pull data straight from PDFs into Excel spreadsheets in a few easy clicks.",
    descriptionSw: "Toa taarifa moja kwa moja kutoka kwenye PDF kuingia kwenye jedwali la Excel kwa hatua chache.",
  },
  "/tools/pdf-to-pdfa": {
    description: "Transform PDF to PDF/A, the ISO-standardized version of PDF for long-term archiving. Your PDF will preserve formatting when accessed in the future.",
    descriptionSw: "Badilisha PDF kuwa PDF/A, aina ya PDF inayokidhi kiwango cha ISO kwa uhifadhi wa muda mrefu. Mpangilio wa hati yako utabaki salama siku zijazo.",
  },
  "/tools/rotate-pdf": {
    description: "Rotate your PDFs the way you need them. You can even rotate multiple PDFs at once!",
    descriptionSw: "Zungusha PDF zako jinsi unavyohitaji. Unaweza hata kuzungusha PDF nyingi kwa wakati mmoja!",
  },
  "/tools/add-page-numbers": {
    description: "Easily insert page numbers into your PDF in seconds. Choose your positions, dimensions, typography.",
    descriptionSw: "Ongeza namba za kurasa kwenye PDF yako kwa sekunde chache. Chagua nafasi, ukubwa, na aina ya maandishi.",
    badge: "New",
  },
  "/tools/add-watermark": {
    description: "Stamp an image or text over your PDF in seconds. Choose the typography, transparency and position.",
    descriptionSw: "Weka muhuri wa picha au maandishi juu ya PDF yako kwa sekunde chache. Chagua aina ya maandishi, uwazi, na nafasi.",
  },
  "/tools/crop-pdf": {
    description: "Crop margins of PDF documents or select specific areas, then easily apply the changes to every page.",
    descriptionSw: "Punguza pambizo za hati za PDF au chagua eneo maalum, kisha tumia mabadiliko hayo kwa kurasa zote kwa urahisi.",
  },
  "/tools/edit-pdf": {
    description: "Add text, shapes, comments, highlight or even blackout text in PDF. Fill, edit, and sign PDF forms.",
    descriptionSw: "Ongeza maandishi, maumbo, maoni, weka alama au funika maandishi kwenye PDF. Jaza, hariri, na tia sahihi fomu za PDF.",
  },
  "/tools/pdf-forms": {
    description: "Fill, create, and extract data from PDF forms. Edit PDF form fields yourself. Add text fields, checkboxes, multiple choice, and more.",
    descriptionSw: "Jaza, tengeneza, na toa taarifa kutoka kwenye fomu za PDF. Hariri sehemu za fomu mwenyewe — ongeza sehemu za maandishi, visanduku vya kuchagua, na zaidi.",
  },
  "/tools/unlock-pdf": {
    description: "Remove PDF password security, giving you the freedom to use your PDFs as you want.",
    descriptionSw: "Ondoa ulinzi wa nenosiri kwenye PDF, ili uweze kutumia PDF yako jinsi unavyotaka.",
  },
  "/tools/protect-pdf": {
    description: "Protect PDF files with a password. Encrypt PDF documents to prevent unauthorized access.",
    descriptionSw: "Linda faili za PDF kwa nenosiri. Simba hati za PDF ili kuzuia ufikiaji usioruhusiwa.",
  },
  "/tools/sign-pdf": {
    description: "Sign yourself or request electronic signatures from others legally.",
    descriptionSw: "Tia sahihi mwenyewe au omba sahihi za kielektroniki kutoka kwa wengine kihalali.",
  },
  "/tools/redact-pdf": {
    description: "Redact text and graphics to permanently remove sensitive information from a PDF.",
    descriptionSw: "Ondoa kabisa maandishi na picha zenye taarifa nyeti kutoka kwenye PDF, si kufunika tu.",
  },
  "/tools/compare-pdf": {
    description: "Show what has changed between two versions of the same PDF. Review differences side by side.",
    descriptionSw: "Onyesha yaliyobadilika kati ya matoleo mawili ya PDF ile ile. Angalia tofauti bega kwa bega.",
  },
  "/tools/pdf-to-markdown": {
    description: "Easily turn PDFs into Markdown files. Perfect for notes, docs, and static-site tooling.",
    descriptionSw: "Badilisha PDF kuwa faili za Markdown kwa urahisi. Inafaa kwa madokezo, hati, na tovuti tuli.",
    badge: "New",
  },
  "/tools/workflow-pipeline": {
    description: "Chain multiple PDF operations into one automated pipeline — merge, OCR, watermark, compress, and more in a single run.",
    descriptionSw: "Unganisha hatua kadhaa za PDF kuwa mtiririko mmoja wa kiotomatiki — kuunganisha, OCR, alama ya maji, kupunguza ukubwa, na zaidi kwa mara moja.",
    badge: "New",
  },
};

export const HOME_TOOL_HREFS = [
  "/tools/merge-pdf",
  "/tools/split-pdf",
  "/tools/compress-pdf",
  "/tools/pdf-to-word",
  "/tools/pdf-to-powerpoint",
  "/tools/pdf-to-excel",
  "/tools/word-to-pdf",
  "/tools/powerpoint-to-pdf",
  "/tools/excel-to-pdf",
  "/tools/edit-pdf",
  "/tools/pdf-to-jpg",
  "/tools/jpg-to-pdf",
  "/tools/sign-pdf",
  "/tools/add-watermark",
  "/tools/rotate-pdf",
  "/tools/html-to-pdf",
  "/tools/unlock-pdf",
  "/tools/protect-pdf",
  "/tools/organize-pdf",
  "/tools/pdf-to-pdfa",
  "/tools/repair-pdf",
  "/tools/add-page-numbers",
  "/tools/scan-to-pdf",
  "/tools/ocr-pdf",
  "/tools/compare-pdf",
  "/tools/redact-pdf",
  "/tools/crop-pdf",
  "/tools/pdf-forms",
  "/tools/pdf-to-markdown",
  "/tools/remove-pages",
  "/tools/extract-pages",
  "/tools/workflow-pipeline",
] as const;

export const TOOL_CARD_FILTERS: { id: string; label: string; titles: readonly string[] }[] = [
  { id: "all", label: "All", titles: [] },
  { id: "organize", label: "Organize PDF", titles: ["Organize PDF"] },
  { id: "optimize", label: "Optimize PDF", titles: ["Optimize PDF"] },
  { id: "convert", label: "Convert PDF", titles: ["Convert to PDF", "Convert from PDF"] },
  { id: "edit", label: "Edit PDF", titles: ["Edit PDF"] },
  { id: "security", label: "PDF Security", titles: ["PDF Security"] },
  { id: "automation", label: "Automation", titles: ["Automation"] },
];

export type CatalogTool = ToolsMenuItem & {
  categoryTitle: string;
  description: string;
  descriptionSw?: string;
  badge?: string;
};

export function getCatalogTools(menu: ToolsMenuConfig = ALL_PDF_TOOLS_MENU): CatalogTool[] {
  const seen = new Set<string>();
  const tools: CatalogTool[] = [];

  for (const category of menu) {
    for (const item of category.items) {
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      const copy = TOOL_CARD_COPY[item.href];
      tools.push({
        ...item,
        categoryTitle: category.title,
        description: copy?.description ?? item.description ?? "",
        descriptionSw: copy?.descriptionSw,
        badge: copy?.badge ?? item.badge,
      });
    }
  }

  const byHref = new Map(tools.map((tool) => [tool.href, tool]));
  const ordered: CatalogTool[] = [];

  for (const href of HOME_TOOL_HREFS) {
    const tool = byHref.get(href);
    if (tool) ordered.push(tool);
  }

  for (const tool of tools) {
    if (!ordered.some((item) => item.href === tool.href)) ordered.push(tool);
  }

  return ordered;
}
