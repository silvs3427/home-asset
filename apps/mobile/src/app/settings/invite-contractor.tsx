import { Redirect } from "expo-router";

/** Invite moved to Contractors hub on Home. */
export default function InviteContractorRedirect() {
  return <Redirect href="/contractors/invite" />;
}
