import { CrateApp } from "@/components/CrateApp";

/** Messages for the reasons the OAuth routes can bounce someone back here. */
const OAUTH_ERRORS: Record<string, string> = {
  oauth_declined: "You cancelled the Discogs sign-in.",
  oauth_expired: "That sign-in took too long. Please try again.",
  oauth_mismatch: "That sign-in didn't match this browser. Please try again.",
  oauth_failed: "Discogs couldn't complete the sign-in. Please try again.",
  oauth_unconfigured: "Discogs sign-in isn't set up on this deployment.",
};

/**
 * A server component purely so the OAuth routes' `?error=` redirect can be
 * read here and handed down. Doing it on the client would mean reading the URL
 * after mount, which is both an extra render and a hydration mismatch.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const { error } = await searchParams;
  const reason = typeof error === "string" ? error : undefined;

  return (
    <CrateApp
      signInError={
        reason
          ? (OAUTH_ERRORS[reason] ?? "Discogs sign-in failed. Please try again.")
          : undefined
      }
    />
  );
}
