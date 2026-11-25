import { Redirect } from "expo-router";

/**
 * Former contractor-only notes formatter.
 * HomeAsset is homeowner-only; contractors use LightLift or a future
 * homeowner-sent invite link. Deep links land on HomeAsset entry.
 */
export default function ContractorFormatScreen() {
  return <Redirect href="/ai/help" />;
}
