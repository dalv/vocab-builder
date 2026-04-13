import { notFound } from "next/navigation";
import IndonesianContent from "./indonesian-content";
import MandarinContent from "./mandarin-content";
import VocabShell from "./vocab-shell";

const LANGUAGES = ["indonesian", "mandarin"] as const;

export function generateStaticParams() {
  return LANGUAGES.map((lang) => ({ lang }));
}

export default async function LanguagePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  if (!LANGUAGES.includes(lang as (typeof LANGUAGES)[number])) {
    notFound();
  }

  let content;
  switch (lang) {
    case "indonesian":
      content = <IndonesianContent />;
      break;
    case "mandarin":
      content = <MandarinContent />;
      break;
    default:
      notFound();
  }

  return <VocabShell lang={lang}>{content}</VocabShell>;
}
