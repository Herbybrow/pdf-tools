import { getCatalogTools } from "@/components/header";
import BackToToolsButton from "@/components/tools/BackToToolsButton";
import GenericToolPage from "@/components/tools/GenericToolPage";
import WorkspaceToolPage from "@/components/tools/WorkspaceToolPage";
import ComparePdfPage from "@/components/tools/bespoke/ComparePdfPage";
import EditPdfPage from "@/components/tools/bespoke/EditPdfPage";
import MergePdfPage from "@/components/tools/bespoke/MergePdfPage";
import OrganizePdfPage from "@/components/tools/bespoke/OrganizePdfPage";
import PdfFormsPage from "@/components/tools/bespoke/PdfFormsPage";
import RedactPdfPage from "@/components/tools/bespoke/RedactPdfPage";
import ScanToPdfPage from "@/components/tools/bespoke/ScanToPdfPage";
import SignPdfPage from "@/components/tools/bespoke/SignPdfPage";
import WorkflowPipelinePage from "@/components/tools/bespoke/WorkflowPipelinePage";
import { getToolDefinition } from "@/lib/toolDefinitions";

type ToolPageProps = {
  params: Promise<{ slug: string }>;
};

// Icon/label lookups happen client-side (via getCatalogTools()) inside each of these
// components instead of being passed as props from here -- this file is a Server
// Component, and a Lucide icon is a component reference (a function), which can't cross
// the server->client props boundary ("Only plain objects can be passed to Client
// Components from Server Components"). A plain string slug can, so that's what's threaded
// through instead.
type BespokePageProps = { slug: string };

const BESPOKE_PAGES: Record<string, (props: BespokePageProps) => React.ReactElement> = {
  "merge-pdf": MergePdfPage,
  "organize-pdf": OrganizePdfPage,
  "scan-to-pdf": ScanToPdfPage,
  "edit-pdf": EditPdfPage,
  "pdf-forms": PdfFormsPage,
  "redact-pdf": RedactPdfPage,
  "compare-pdf": ComparePdfPage,
  "sign-pdf": SignPdfPage,
  "workflow-pipeline": WorkflowPipelinePage,
};

function ComingSoon({ title }: { title: string }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10 sm:px-10">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      <p className="mt-2 max-w-xl text-gray-600 dark:text-gray-400">
        This tool is being finalized as part of the NSSF PDF Tools rollout and will be available shortly.
      </p>
    </main>
  );
}

export default async function ToolPage({ params }: ToolPageProps) {
  const { slug } = await params;
  const catalogEntry = getCatalogTools().find((tool) => tool.href === `/tools/${slug}`);
  const title =
    catalogEntry?.label ??
    slug
      .split("-")
      .map((part) => (part === "pdf" ? "PDF" : part.charAt(0).toUpperCase() + part.slice(1)))
      .join(" ");

  const Bespoke = BESPOKE_PAGES[slug];
  if (Bespoke) {
    return (
      <>
        <BackToToolsButton />
        <Bespoke slug={slug} />
      </>
    );
  }

  const definition = getToolDefinition(slug);
  if (definition) {
    const ToolLayout = definition.layout === "workspace" ? WorkspaceToolPage : GenericToolPage;
    return (
      <>
        <BackToToolsButton />
        <ToolLayout
          definition={definition}
          title={title}
          titleSw={catalogEntry?.labelSw}
          description={catalogEntry?.description}
          descriptionSw={catalogEntry?.descriptionSw}
        />
      </>
    );
  }

  return (
    <>
      <BackToToolsButton />
      <ComingSoon title={title} />
    </>
  );
}
