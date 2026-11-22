import NexNoteApp from "@/components/NexNoteApp";
import BrowserPreviewBanner from "@/components/site/BrowserPreviewBanner";

type SearchParamValue = string | string[] | undefined;
type SearchParamRecord = Record<string, SearchParamValue>;

interface NexNoteAppPageProps {
  searchParams?: Promise<SearchParamRecord>;
}

export default function NexNoteAppPage({ searchParams }: NexNoteAppPageProps) {
  return (
    <>
      <NexNoteApp searchParams={searchParams} />
      <BrowserPreviewBanner />
    </>
  );
}
