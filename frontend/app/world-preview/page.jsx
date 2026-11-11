import WorldComingSoon from "@/components/vcr/WorldComingSoon";

// Read-only public preview for visual acceptance on mobile, without login.
// The actual /vcr route remains protected and the unfinished World engine
// remains available only when NEXT_PUBLIC_WORLD_TEST_MODE=isolated.
export const metadata = {
  title: "World en construcción | MeetYouLive",
  description: "World está en preparación. Descubre lo que queremos crear en MeetYouLive.",
  robots: { index: false, follow: false },
};

export default function WorldPreviewPage() {
  return <WorldComingSoon />;
}
