import Link from "next/link";
import ActiveNav from "./active-nav";
import SignOutButton from "../components/SignOutButton";
import ReviewShortcut from "../components/ReviewShortcut";

const LANGUAGES = [
  { slug: "indonesian", label: "Indonesian", subtitle: "Conversational words & phrases for everyday life in Bali" },
  { slug: "mandarin", label: "中文", subtitle: "Essential vocabulary for everyday Mandarin Chinese" },
];

export default async function LanguageLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const current = LANGUAGES.find((l) => l.slug === lang) ?? LANGUAGES[0];

  return (
    <>
      <header>
        <SignOutButton />
        <div className="lang-selector">
          {LANGUAGES.map((l) => (
            <Link
              key={l.slug}
              href={`/${l.slug}`}
              className={`lang-pill${l.slug === lang ? " lang-pill-active" : ""}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <h1>Vocabulary Builder</h1>
        <p>{current.subtitle}</p>
      </header>

      <ActiveNav />
      <ReviewShortcut />

      {children}
    </>
  );
}
