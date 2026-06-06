import NexNoteApp from "@/components/NexNoteApp";

type SearchParamValue = string | string[] | undefined;
type SearchParamRecord = Record<string, SearchParamValue>;

interface NexNoteAppPageProps {
  searchParams?: Promise<SearchParamRecord>;
}

export default function NexNoteAppPage({ searchParams }: NexNoteAppPageProps) {
  return <NexNoteApp searchParams={searchParams} />;
}
