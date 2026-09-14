import type { OptionField } from "./toolDefinitions";

export type WorkflowStepType =
  | "merge"
  | "ocr"
  | "watermark"
  | "compress"
  | "convert-pdfa"
  | "rotate"
  | "crop"
  | "add-page-numbers"
  | "remove-pages"
  | "extract-pages"
  | "repair"
  | "protect";

export type WorkflowStepDef = { type: WorkflowStepType; label: string; labelSw?: string; fields: OptionField[] };

const PAGE_FIELD: OptionField = {
  type: "page-range",
  name: "pages",
  label: "Pages",
  labelSw: "Kurasa",
  placeholder: "leave blank for all",
  placeholderSw: "acha wazi kwa zote",
};

export const WORKFLOW_STEPS: WorkflowStepDef[] = [
  { type: "merge", label: "Merge all uploaded files", labelSw: "Unganisha faili zote zilizopakiwa", fields: [] },
  {
    type: "ocr",
    label: "OCR (make searchable)",
    labelSw: "OCR (fanya itafutike)",
    fields: [
      {
        type: "select",
        name: "language",
        label: "Language",
        labelSw: "Lugha",
        defaultValue: "eng",
        options: [
          { value: "eng", label: "English", labelSw: "Kiingereza" },
          { value: "swa", label: "Kiswahili", labelSw: "Kiswahili" },
          { value: "eng+swa", label: "English + Kiswahili", labelSw: "Kiingereza + Kiswahili" },
        ],
      },
    ],
  },
  {
    type: "watermark",
    label: "Add text watermark",
    labelSw: "Ongeza alama ya maji (maandishi)",
    fields: [
      { type: "text", name: "text", label: "Watermark text", labelSw: "Maandishi ya alama ya maji", defaultValue: "NSSF CONFIDENTIAL" },
      { type: "number", name: "opacity", label: "Opacity (0-1)", labelSw: "Uwazi (0-1)", defaultValue: 0.3, min: 0, max: 1, step: 0.05 },
      { type: "number", name: "rotation", label: "Rotation (°)", labelSw: "Mzunguko (°)", defaultValue: 45, min: 0, max: 360 },
      PAGE_FIELD,
    ],
  },
  {
    type: "compress",
    label: "Compress",
    labelSw: "Punguza ukubwa",
    fields: [
      {
        type: "select",
        name: "level",
        label: "Level",
        labelSw: "Kiwango",
        defaultValue: "ebook",
        options: [
          { value: "screen", label: "Smallest size", labelSw: "Ukubwa mdogo zaidi" },
          { value: "ebook", label: "Recommended", labelSw: "Inapendekezwa" },
          { value: "printer", label: "Best quality", labelSw: "Ubora wa juu zaidi" },
        ],
      },
    ],
  },
  {
    type: "convert-pdfa",
    label: "Convert to PDF/A",
    labelSw: "Badilisha kuwa PDF/A",
    fields: [
      {
        type: "select",
        name: "standard",
        label: "Standard",
        labelSw: "Kigezo",
        defaultValue: "pdfa-2b",
        options: [
          { value: "pdfa-1b", label: "PDF/A-1b", labelSw: "PDF/A-1b" },
          { value: "pdfa-2b", label: "PDF/A-2b", labelSw: "PDF/A-2b" },
        ],
      },
    ],
  },
  {
    type: "rotate",
    label: "Rotate",
    labelSw: "Zungusha",
    fields: [
      {
        type: "select",
        name: "angle",
        label: "Angle",
        labelSw: "Pembe",
        defaultValue: "90",
        options: [
          { value: "90", label: "90°", labelSw: "90°" },
          { value: "180", label: "180°", labelSw: "180°" },
          { value: "270", label: "270°", labelSw: "270°" },
        ],
      },
      PAGE_FIELD,
    ],
  },
  {
    type: "crop",
    label: "Crop margins",
    labelSw: "Punguza pambizo",
    fields: [
      { type: "number", name: "top", label: "Top (pt)", labelSw: "Juu (pt)", defaultValue: 0 },
      { type: "number", name: "bottom", label: "Bottom (pt)", labelSw: "Chini (pt)", defaultValue: 0 },
      { type: "number", name: "left", label: "Left (pt)", labelSw: "Kushoto (pt)", defaultValue: 0 },
      { type: "number", name: "right", label: "Right (pt)", labelSw: "Kulia (pt)", defaultValue: 0 },
      PAGE_FIELD,
    ],
  },
  {
    type: "add-page-numbers",
    label: "Add page numbers",
    labelSw: "Ongeza namba za kurasa",
    fields: [
      { type: "text", name: "format", label: "Format", labelSw: "Muundo", defaultValue: "Page {page} of {total}" },
      {
        type: "select",
        name: "position",
        label: "Position",
        labelSw: "Nafasi",
        defaultValue: "bottom-center",
        options: [
          { value: "bottom-center", label: "Bottom center", labelSw: "Chini katikati" },
          { value: "bottom-left", label: "Bottom left", labelSw: "Chini kushoto" },
          { value: "bottom-right", label: "Bottom right", labelSw: "Chini kulia" },
        ],
      },
      PAGE_FIELD,
    ],
  },
  {
    type: "remove-pages",
    label: "Remove pages",
    labelSw: "Ondoa kurasa",
    fields: [{ ...PAGE_FIELD, label: "Pages to remove", labelSw: "Kurasa za kuondoa" }],
  },
  {
    type: "extract-pages",
    label: "Extract pages",
    labelSw: "Toa kurasa",
    fields: [{ ...PAGE_FIELD, label: "Pages to extract", labelSw: "Kurasa za kutoa" }],
  },
  { type: "repair", label: "Repair", labelSw: "Tengeneza", fields: [] },
  {
    type: "protect",
    label: "Password-protect",
    labelSw: "Linda kwa nenosiri",
    fields: [
      { type: "password", name: "userPassword", label: "Password to open", labelSw: "Nenosiri la kufungua" },
      {
        type: "select",
        name: "encryption",
        label: "Encryption",
        labelSw: "Usimbaji fiche",
        defaultValue: "aes256",
        options: [
          { value: "aes128", label: "AES-128", labelSw: "AES-128" },
          { value: "aes256", label: "AES-256", labelSw: "AES-256" },
        ],
      },
    ],
  },
];

export function getWorkflowStepDef(type: WorkflowStepType): WorkflowStepDef {
  return WORKFLOW_STEPS.find((s) => s.type === type) ?? WORKFLOW_STEPS[0];
}
