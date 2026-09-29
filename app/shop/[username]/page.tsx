import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedShop } from "@/components/shop/SharedShop";
import { isDiscogsUsername } from "@/lib/shop/share";

export async function generateMetadata({
  params,
}: PageProps<"/shop/[username]">): Promise<Metadata> {
  const { username } = await params;
  if (!isDiscogsUsername(username)) return {};
  return {
    title: `${username}'s Records — a record shop made from their Discogs collection`,
    description: `Walk round ${username}'s record shop, dig through the crates and put something on the turntable.`,
  };
}

/**
 * Someone's collection as a shop anyone can walk into, from a shared link.
 * Only public Discogs collections can be visited; see /api/shop/[username].
 */
export default async function SharedShopPage({ params }: PageProps<"/shop/[username]">) {
  const { username } = await params;
  if (!isDiscogsUsername(username)) notFound();
  return <SharedShop username={username} />;
}
