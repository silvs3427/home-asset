import { Redirect } from "expo-router";

/**
 * Notifications are delivery for reminders / recalls / submissions.
 * Homeowners use one Alerts surface at /reminders.
 */
export default function NotificationsRedirect() {
  return <Redirect href="/reminders" />;
}
