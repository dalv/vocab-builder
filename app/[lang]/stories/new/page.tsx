import { notFound } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import LoginForm from "../../../review/LoginForm";
import TopicCapture from "./TopicCapture";

export const dynamic = "force-dynamic";

export default async function NewStoryPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (lang !== "indonesian") notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <LoginForm />;

  return <TopicCapture lang={lang} />;
}
