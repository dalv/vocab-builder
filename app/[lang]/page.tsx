import { notFound } from "next/navigation";
import IndonesianContent from "./indonesian-content";
import MandarinContent from "./mandarin-content";

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

  switch (lang) {
    case "indonesian":
      return <IndonesianContent />;
    case "mandarin":
      return <MandarinContent />;
    default:
      notFound();
  }
}
